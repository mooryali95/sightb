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
  src/pages/__tests__/FinancialOverview.test.tsx src/hooks/__tests__/useDashboardFilters.test.tsx \
  supabase/functions/_shared/sessionGate.ts src/test/edge/session-gate.test.ts \
  supabase/migrations/20260924150000_second_factor_on_the_server.sql \
  supabase/migrations/20260926120000_second_factor_on_database_functions.sql \
  scripts/second-factor-coverage.sh \
  src/lib/registry/names.ts src/lib/registry/__tests__/names.test.ts \
  src/lib/registry/party-summary.ts src/lib/registry/__tests__/party-summary.test.ts \
  src/services/registryService.ts src/pages/company/registry/RegistrySection.tsx \
  src/pages/company/registry/LinkNamesSheet.tsx src/pages/PartyDetail.tsx \
  src/components/registry/RegistryNamePicker.tsx src/hooks/useParties.ts \
  src/components/project/ledger/CompanyFundingCard.tsx src/lib/finance/company-net.ts \
  src/components/project/funds/PendingCarryCard.tsx supabase/migrations/20261028090000_close_the_money_loop.sql \
  src/lib/finance/integrity.ts src/lib/finance/__tests__/integrity.test.ts src/pages/company/IntegrityCard.tsx e2e/data-integrity.spec.ts \
  supabase/migrations/20261104090000_user_roles_policy_without_recursion.sql supabase/tests/roles.sql supabase/tests/fund-advance.sql \
  src/lib/finance/loans.ts src/lib/finance/__tests__/loans.test.ts src/pages/company/ledger/LoanDialog.tsx e2e/company-loans.spec.ts \
  e2e/resource-registry.spec.ts supabase/migrations/20261027090000_resource_registry.sql; do
  need_file "$f"
done
need_text src/components/project/ExpensesSection.tsx "summarizeSpendByResource"
need_text src/components/project/stats/BudgetRow.tsx "تجاوز الموازنة"
need_text src/pages/__tests__/Login.test.tsx "checking once and saying \"code sent\" once"
need_text AGENTS.md "docs/LOVABLE_HANDOFF.md"
need_text .github/workflows/quality.yml "ssot-guard.sh"
need_text src/lib/finance/summary.ts "export function getCollectedRevenue"
need_text src/pages/CompanyDetail.tsx "CompanyLedgerSection"
need_text src/pages/project-detail/ProjectSection.tsx "ChargedCostsCard"
need_text src/App.tsx 'path="/organize"'
need_text src/pages/FinancialOverview.tsx "needsAttention"
need_text src/pages/dashboard/dashboardFigures.ts "export function needsAttention"
need_text supabase/migrations/20261016120000_company_ledger.sql "SELECT public.require_second_factor();"
need_text .github/workflows/quality.yml "second-factor-coverage.sh"
need_text src/pages/CompanyDetail.tsx "RegistrySection"
need_text src/App.tsx 'path="/company/:id/party/:partyId"'

[ "$fail" = 0 ] && echo "Protected files and behaviours present."
exit "$fail"
