#!/usr/bin/env bash
# What a visitor downloads before signing in: the files dist/index.html loads
# up front. Fails when any of the heavy, rarely-used chunks is among them.
#
# vendor-charts, vendor-pdf and vendor-xlsx are meant to load only when a page
# draws a chart or exports a file. Once they were preloaded by every page, the
# login page included, because the entry imported React, clsx and two build
# helpers from them: 1969 KB (568 KB gzipped) before anyone signed in, against
# 1045 KB (299 KB) once those shared modules got a chunk of their own. See
# manualChunks in vite.config.ts.
#
# It also holds a budget on the gzipped total, a ratchet like the ESLint one:
# lower it when the first load shrinks, never raise it to absorb growth. 299 KB
# after the chunks were fixed; 260 KB once zod loaded on submit and the landing
# and login pages took framer-motion's light `m` components.
#
#   scripts/initial-load-guard.sh [dist-dir]     run after `bun run build`
set -euo pipefail

GZIP_BUDGET_KB=280

dist="${1:-dist}"
index="$dist/index.html"
if [ ! -f "$index" ]; then
  echo "initial-load-guard: $index not found; run the build first" >&2
  exit 2
fi

files=$(grep -oE '/assets/[^"]+\.(js|css)' "$index" | sort -u)
raw=0
gz=0
for f in $files; do
  raw=$((raw + $(wc -c < "$dist$f")))
  gz=$((gz + $(gzip -9c "$dist$f" | wc -c)))
done
echo "Loaded before sign-in: $(echo "$files" | wc -l) files, $((raw / 1024)) KB ($((gz / 1024)) KB gzipped)"
echo "$files" | sed 's/^/  /'

heavy=$(echo "$files" | grep -E '/vendor-(charts|pdf|xlsx)-' || true)
if [ -n "$heavy" ]; then
  echo "initial-load-guard: heavy chunks load before sign-in:"
  echo "$heavy" | sed 's/^/  /'
  echo "Something the entry needs was placed in one of them; see manualChunks in vite.config.ts."
  exit 1
fi
echo "No heavy chunk loads before sign-in."

if [ $((gz / 1024)) -gt "$GZIP_BUDGET_KB" ]; then
  echo "initial-load-guard: $((gz / 1024)) KB gzipped before sign-in, over the $GZIP_BUDGET_KB KB budget."
  echo "Find what grew and load it where it is used; do not raise the budget to absorb it."
  exit 1
fi
echo "Within the $GZIP_BUDGET_KB KB budget."
