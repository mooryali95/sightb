#!/usr/bin/env bash
# Colours come from the theme's tokens, never from Tailwind's raw palette.
#
# 232 classes such as text-amber-700 / dark:text-amber-400 were replaced on
# 6 November 2026 by the warning, success, destructive and info tokens, which
# carry their own dark values. A raw class brings back one theme's colour on
# the other theme's background. Chart colours live in src/lib/chart-colors.ts
# alone. Category hues (violet, indigo, cyan) mark kinds, not states, and
# stay allowed. See docs/design-system.md.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0

raw=$(grep -rnoE "(^|[\"'\` :])((hover|focus|dark|group-hover):)?(text|bg|border|ring|fill|stroke|from|to|via)-(red|green|amber|yellow|blue|emerald|orange)-[0-9]{2,3}" src --include=*.tsx --include=*.ts \
  | grep -v '/__tests__/' || true)
if [ -n "$raw" ]; then
  echo "::error::raw palette colour classes; use text-/bg-/border- with warning, success, destructive or info:"
  echo "$raw"
  fail=1
fi

lit=$(grep -rnoE "'hsl\([0-9][^']*'" src --include=*.tsx --include=*.ts | grep -v '/__tests__/' | grep -v '^src/lib/chart-colors.ts:' || true)
if [ -n "$lit" ]; then
  echo "::error::colour literals outside src/lib/chart-colors.ts:"
  echo "$lit"
  fail=1
fi

[ "$fail" = 0 ] && echo "Colours come from the tokens and the chart palette."
exit "$fail"
