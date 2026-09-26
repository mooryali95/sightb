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

later=("${files[@]:$((start + 1))}")
[ "${#later[@]}" -eq 0 ] && { echo "No migration after $ENFORCING; nothing to cover."; exit 0; }

# One perl pass over the later migrations in order, statement by statement.
perl -0777 -e '
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
  if (@problems) {
    print "$_\n" for @problems;
    print "second-factor-coverage: ", scalar(@problems), " problem(s) with the second_factor policy.\n";
    print "Add: CREATE POLICY second_factor ON public.<table> AS RESTRICTIVE FOR ALL TO authenticated\n";
    print "     USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()));\n";
    exit 1;
  }
  print "Every public table created since the enforcing migration carries the second_factor policy.\n";
' "${later[@]}"
