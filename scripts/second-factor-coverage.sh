#!/usr/bin/env bash
# Every public table created after the second factor became a database rule
# must carry that rule too, and no later migration may weaken it.
#
# 20260924150000_second_factor_on_the_server.sql puts a RESTRICTIVE policy
# named second_factor on every public table that existed then (on user_roles
# only for writes). A table a later migration creates (Lovable writes
# migrations as well) would have no such policy, and a password-only session
# could read it. This fails the build naming the table.
#
# A later migration covers its tables either with
#   CREATE POLICY second_factor ON public.<table> AS RESTRICTIVE ...
# or by re-running the loop that adds it to every table (it contains
# "second_factor ON public.%I"), which covers every table created up to it.
# It fails on a second_factor policy that is not RESTRICTIVE (a permissive
# one would open every row), and on a DROP POLICY second_factor that the
# same migration does not re-create.
#
# Statements are read whole, across lines, with quoted or unquoted names.
# Exit 0 when covered, 1 naming what is not, 2 when the enforcing migration
# cannot be found (the check would otherwise pass having checked nothing).
set -euo pipefail
cd "$(dirname "$0")/.."

ENFORCING="20260924150000_second_factor_on_the_server.sql"

mapfile -t files < <(ls supabase/migrations/*.sql | sort)
start=-1
for i in "${!files[@]}"; do
  [ "$(basename "${files[$i]}")" = "$ENFORCING" ] && start=$i
done
if [ "$start" -lt 0 ]; then
  echo "second-factor-coverage: $ENFORCING not found; nothing checked" >&2
  exit 2
fi

# Edge functions Lovable owns that act for the user through the service
# role, past row-level security: each must keep asking the database's rule.
fn_missing=0
for fn in send-invite delete-user admin-email-status; do
  if ! grep -q "requireSecondFactor(" "supabase/functions/$fn/index.ts" 2>/dev/null; then
    echo "  UNGUARDED function $fn: it no longer calls requireSecondFactor (see _shared/sessionGate.ts)"
    fn_missing=$((fn_missing + 1))
  fi
done

# Database functions: after 20260926120000 every SECURITY DEFINER function a
# user may call carries require_second_factor. A later migration defining one
# must carry it too, revoke it from authenticated, or re-run that migration's
# loop (which calls plpgsql_block_begin).
FN_GUARD="20260926120000_second_factor_on_database_functions.sql"
fn_problems=$(ls supabase/migrations/*.sql | sort | awk -v g="$FN_GUARD" 'found { print } $0 ~ g { found = 1 }' | xargs -r perl -0777 -e '
  my @out;
  my %helper = map { $_ => 1 } qw(has_role has_access can_edit can_access_expense_receipt can_access_resource_receipt
                                  second_factor_ok second_factor_required require_second_factor plpgsql_block_begin);
  for my $f (@ARGV) {
    open my $fh, "<", $f or die; local $/; my $sql = <$fh>; close $fh;
    (my $name = $f) =~ s{.*/}{};
    next if $sql =~ /plpgsql_block_begin\(/;
    while ($sql =~ /create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?(\w+)"?\s*\((.*?)\$(\w*)\$(.*?)\$\3\$/gis) {
      my ($fn, $head, $body) = (lc $1, $2, $4);
      next unless $head =~ /security\s+definer/i;
      next if $head =~ /returns\s+trigger/i || $helper{$fn};
      next if $body =~ /require_second_factor/i;
      next if $sql =~ /revoke\s+(?:all|execute)\s+on\s+function\s+(?:public\.)?\Q$fn\E\b[^;]*\bauthenticated\b/i;
      push @out, "  UNGUARDED database function $fn (in $name): add PERFORM public.require_second_factor(); or revoke it from authenticated";
    }
  }
  print "$_\n" for @out;
')
[ -n "$fn_problems" ] && echo "$fn_problems"
fn_missing=$((fn_missing + $(printf '%s' "$fn_problems" | grep -c . || true)))

later=("${files[@]:$((start + 1))}")
if [ "${#later[@]}" -eq 0 ]; then
  [ "$fn_missing" -gt 0 ] && { echo "second-factor-coverage: $fn_missing function(s) without the guard."; exit 1; }
  echo "No migration after $ENFORCING; nothing to cover."; exit 0
fi

# One perl pass over the later migrations in order, statement by statement.
FN_MISSING=$fn_missing perl -0777 -e '
  my (%pending, @problems);
  for my $f (@ARGV) {
    open my $fh, "<", $f or die "$f: $!"; local $/; my $sql = <$fh>; close $fh;
    $sql =~ s/--[^\n]*//g;                 # line comments
    (my $name = $f) =~ s{.*/}{};
    my $id = qr/"?([a-z0-9_]+)"?/i;
    my $pub = qr/(?:"?public"?\s*\.\s*)?/i;  # an unqualified table lands in public
    for my $stmt (split /;/, $sql) {
      $stmt =~ s/\s+/ /g;
      if ($stmt =~ /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${pub}${id}/i) {
        my $t = lc $1; $pending{$t} = $name unless $stmt =~ /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?"?(?!public)[a-z0-9_]+"?\s*\./i;
      }
      if ($stmt =~ /second_factor\s+ON\s+public\.%I/i) { %pending = (); next }
      if ($stmt =~ /\bcreate\s+policy\s+"?(second_factor\w*)"?\s+on\s+${pub}${id}/i) {
        my ($p, $t) = ($1, lc $2);
        if ($stmt !~ /\bas\s+restrictive\b/i) { push @problems, "  NOT RESTRICTIVE policy $p on public.$t (in $name)"; next }
        delete $pending{$t};
      }
      if ($stmt =~ /\bdrop\s+policy\s+(?:if\s+exists\s+)?"?(second_factor\w*)"?\s+on\s+${pub}${id}/i) {
        my ($p, $t) = ($1, lc $2);
        push @problems, "  DROPPED policy $p on public.$t (in $name) without re-creating it"
          unless $sql =~ /create\s+policy\s+"?\Q$p\E"?\s+on\s+${pub}"?\Q$t\E"?[^;]*\bas\s+restrictive\b/is;
      }
    }
  }
  push @problems, map { "  NOT COVERED public.$_ (created in $pending{$_})" } sort keys %pending;
  push @problems, ("  (function guards above)") x $ENV{FN_MISSING} if $ENV{FN_MISSING};
  if (@problems) {
    print "$_\n" for @problems;
    print "second-factor-coverage: ", scalar(@problems), " problem(s) with the second_factor policy.\n";
    print "Add: CREATE POLICY second_factor ON public.<table> AS RESTRICTIVE FOR ALL TO authenticated\n";
    print "     USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()));\n";
    exit 1;
  }
  print "Every public table created since the enforcing migration carries the second_factor policy.\n";
' "${later[@]}"
