#!/usr/bin/env bash
# Fails when a file protected by docs/LOVABLE_HANDOFF.md is missing, or when
# a protected behaviour has been stripped from it. Between 11 and 14 October
# Lovable deleted src/lib/resource-spend.ts together with its tests, so the
# test suite stayed green and nothing noticed.
set -u
fail=0
need_file() { [ -f "$1" ] || { echo "::error file=$1::protected file deleted (see docs/LOVABLE_HANDOFF.md)"; fail=1; }; }
need_text() { grep -qF -- "$2" "$1" 2>/dev/null || { echo "::error file=$1::protected behaviour removed: '$2' (see docs/LOVABLE_HANDOFF.md)"; fail=1; }; }

for f in \
  docs/LOVABLE_HANDOFF.md \
  src/lib/resource-spend.ts src/lib/__tests__/resource-spend.test.ts \
  src/components/project/ExpensesSection.tsx src/components/project/__tests__/ExpensesSection.test.tsx \
  src/components/project/stats/BudgetRow.tsx src/components/project/__tests__/ProjectStatsGrid.test.tsx \
  src/pages/Login.tsx src/pages/__tests__/Login.test.tsx \
  src/lib/query-cache.ts \
  supabase/migrations/20261016120000_company_ledger.sql \
  src/lib/finance/company-ledger.ts src/lib/finance/__tests__/company-ledger.test.ts \
  src/services/companyLedgerService.ts src/pages/company/ledger/CompanyLedgerSection.tsx \
  src/pages/company/ledger/__tests__/CompanyLedgerSection.test.tsx \
  src/lib/project-placement.ts src/lib/__tests__/project-placement.test.ts \
  src/pages/Organize.tsx src/pages/__tests__/Organize.test.tsx \
  src/components/project/ledger/ChargedCostsCard.tsx \
  src/pages/__tests__/FinancialOverview.test.tsx src/hooks/__tests__/useDashboardFilters.test.tsx; do
  need_file "$f"
done
need_text src/components/project/ExpensesSection.tsx "summarizeSpendByResource"
need_text src/components/project/stats/BudgetRow.tsx "تجاوز الموازنة"
need_text src/pages/__tests__/Login.test.tsx "checking once and saying \"code sent\" once"
need_text AGENTS.md "docs/LOVABLE_HANDOFF.md"
need_text src/pages/CompanyDetail.tsx "CompanyLedgerSection"
need_text src/pages/project-detail/ProjectSection.tsx "ChargedCostsCard"
need_text src/App.tsx 'path="/organize"'
need_text src/pages/FinancialOverview.tsx "needsAttention"
need_text src/pages/dashboard/dashboardFigures.ts "export function needsAttention"

[ "$fail" = 0 ] && echo "Protected files and behaviours present."
exit "$fail"
