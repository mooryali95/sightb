#!/usr/bin/env bash
# One source per money rule. The counted-expense rule and the revenue sums
# live in src/lib/finance/summary.ts (getCountedExpenses,
# getCollectedRevenue, getOutstandingInvoiced, getBilledRevenue). A
# hand-copied version agrees today and drifts on the next edit, so the build
# fails naming it. Found 30 October: the counted-expense rule was copied in
# 8 places and the collected sum in 8.
set -u
cd "$(dirname "$0")/.."
ALLOWED='^src/lib/finance/summary\.ts:|/__tests__/|^src/components/project/ExpensesSection\.tsx:'
hits=$(grep -rnE \
  -e "approvalStatus !== 'rejected' && !\w*\.?isOutstandingAdvance" \
  -e "\.filter\(e => e\.approvalStatus !== 'rejected'\)\s*$" \
  -e "status === 'collected'\)\.reduce" \
  -e "status === 'invoiced'\)\.reduce" \
  -e "status === 'invoiced' \|\| r\.status === 'collected'\)\.reduce" \
  src --include='*.ts' --include='*.tsx' | grep -vE "$ALLOWED" || true)
if [ -n "$hits" ]; then
  echo "$hits" | sed 's/^/  hand-copied money rule: /'
  echo "ssot-guard: use getCountedExpenses / getCollectedRevenue / getOutstandingInvoiced / getBilledRevenue from @/lib/finance."
  exit 1
fi
echo "Every money rule comes from src/lib/finance/summary.ts."
