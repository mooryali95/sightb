#!/usr/bin/env bash
# Is what the repository defines actually live? Needs no secret.
#
# On Lovable Cloud there is no Supabase dashboard, no access token and no
# database URL, so migrate.yml and deploy-functions.yml can never be enabled
# and anything arriving through git can sit unapplied unseen. That is how the
# passkeys tables and function stayed missing for four days after #92.
#
# This asks the live project from outside, with the publishable key the
# browser itself ships (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in
# .env), and changes nothing:
#   * every table a migration creates must be known to the API. A table it
#     does not know answers PGRST205; row-level security never hides a table's
#     existence, it only empties the answer.
#   * every column a migration adds to a table (and no later one drops) must
#     be known too. A column it does not know answers 42703; a table that is
#     missing altogether is already reported above, so it is not repeated.
#   * every function folder must be deployed. The platform answers 404 to a
#     CORS preflight for a function it does not have, 200 for one it has.
#
# Database functions (RPCs) are not probed: finding out whether one exists
# means calling it, and some of them write.
#
# Exit 0 when everything is live, 1 when something is missing, 2 when the
# check itself could not run. It never reports "live" for an answer it did
# not get.
set -uo pipefail

cd "$(dirname "$0")/.."

env_value() { [ -f .env ] && sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" .env | head -1; }
URL="${VITE_SUPABASE_URL:-$(env_value VITE_SUPABASE_URL)}"
KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-$(env_value VITE_SUPABASE_PUBLISHABLE_KEY)}"
if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "live-drift: no project URL or publishable key in .env; cannot check" >&2
  exit 2
fi

tables=$(cat supabase/migrations/*.sql \
  | grep -ioE 'create table (if not exists )?public\.[a-z_]+' \
  | awk -F. '{print $NF}' | sort -u)
# ALTER TABLE public.t ... ADD COLUMN c, as table.column, less any column a
# later ALTER TABLE drops. One statement may add several.
columns=$(cat supabase/migrations/*.sql | perl -0777 -ne '
  my (%drop, @add);
  while (/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.(\w+)([^;]*);/gis) {
    my ($t, $b) = (lc $1, $2);
    $drop{"$t." . lc $1} = 1 while $b =~ /drop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi;
    push @add, "$t." . lc $1 while $b =~ /add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi;
  }
  print "$_\n" for grep { !$drop{$_} } @add;
' | sort -u)
functions=$(find supabase/functions -mindepth 2 -maxdepth 2 -name index.ts \
  | awk -F/ '$3 != "_shared" {print $3}' | sort -u)

missing=0
unknown=0

echo "Tables created by migrations: $(echo "$tables" | wc -l)"
for t in $tables; do
  body=$(curl -sS -m 20 "$URL/rest/v1/$t?select=*&limit=0" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -w $'\n%{http_code}' 2>/dev/null)
  code=$(printf '%s' "$body" | tail -1)
  if printf '%s' "$body" | grep -q '"PGRST205"'; then
    echo "  MISSING table  $t"
    missing=$((missing + 1))
  elif [ "$code" = "000" ] || [ -z "$code" ]; then
    echo "  NO ANSWER      $t"
    unknown=$((unknown + 1))
  fi
done

echo "Columns added by migrations: $(echo "$columns" | wc -l)"
for c in $columns; do
  t=${c%%.*}; col=${c#*.}
  body=$(curl -sS -m 20 "$URL/rest/v1/$t?select=$col&limit=0" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -w $'\n%{http_code}' 2>/dev/null)
  code=$(printf '%s' "$body" | tail -1)
  if printf '%s' "$body" | grep -q '"42703"'; then
    echo "  MISSING column $c"
    missing=$((missing + 1))
  elif [ "$code" = "000" ] || [ -z "$code" ]; then
    echo "  NO ANSWER      $c"
    unknown=$((unknown + 1))
  fi
done

echo "Edge functions in the repository: $(echo "$functions" | wc -l)"
for f in $functions; do
  code=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -X OPTIONS "$URL/functions/v1/$f" \
    -H 'Origin: https://sight.basserh.com' -H 'Access-Control-Request-Method: POST' 2>/dev/null)
  if [ "$code" = "404" ]; then
    echo "  MISSING function  $f"
    missing=$((missing + 1))
  elif [ "$code" = "000" ] || [ -z "$code" ]; then
    echo "  NO ANSWER         $f"
    unknown=$((unknown + 1))
  fi
done

if [ "$unknown" -gt 0 ]; then
  echo "live-drift: $unknown probe(s) got no answer; the check did not complete" >&2
  exit 2
fi
if [ "$missing" -gt 0 ]; then
  echo "live-drift: $missing object(s) defined in the repository are not live."
  echo "A migration arriving through git must be applied by hand on Lovable Cloud;"
  echo "a function is deployed when Lovable next syncs and builds the project."
  exit 1
fi
echo "Everything the repository defines is live."
