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
# Money addition has one home too: sumMoney (rounded to the halala) or a named
# rule from @/lib/finance. On 20 November 46 hand-written amount sums were
# found in 27 files under src/components and src/pages; most only added an
# already-filtered list, a few re-implemented a rule (approved change orders,
# planned revenue, rejected spend, outstanding advances). The plain forms were
# moved and a new one fails here naming the file. The second pattern catches
# a reduce whose callback starts on the next line; the third a sum net of
# something inside Math.max, the shape the outstanding-advance rule had.
#
# This catches the usual way of writing a sum, not every way: a loop with
# +=, a destructured ({ amount }), or reversed operands still pass. Grouped
# totals (per category, per month) are written with += on purpose.
SUM_FIELDS='(amount|plannedAmount|amountImpact)'
sums=$(grep -rnE \
  -e "\(\w+, \w+\) => \w+ [+] \(?(Number\()?(\w+\.)+${SUM_FIELDS}\b" \
  -e "\.reduce\(.*[+] *\(?(Number\()?(\w+\.)+${SUM_FIELDS}\b" \
  -e "=> \w+ [+] Math\.max\((\w+\.)+${SUM_FIELDS}\b" \
  src/components src/pages --include='*.ts' --include='*.tsx' | grep -v '/__tests__/' || true)
if [ -n "$sums" ]; then
  echo "$sums" | sed 's/^/  hand-written amount sum: /'
  echo "ssot-guard: add money with sumMoney(rows) from @/lib/finance, or the named rule (getApprovedChangeImpact, getPlannedRevenue, getRejectedExpenseTotal, getTotalPlanned)."
  exit 1
fi
echo "Every money rule comes from src/lib/finance/summary.ts, and no component adds amounts by hand."
