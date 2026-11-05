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
  e2e/resource-registry.spec.ts supabase/migrations/20261027090000_resource_registry.sql \
  e2e/accessibility.spec.ts src/lib/a11y/auto-label.ts src/lib/a11y/scroll-regions.ts src/lib/a11y/page-enter.ts \
  src/lib/a11y/__tests__/auto-label.test.ts src/components/charts/labelled-sector.tsx src/components/ui/__tests__/date-input.test.tsx \
  src/lib/finance/unified-statement.ts src/lib/finance/__tests__/unified-statement.test.ts src/lib/export/unified-statement.ts e2e/unified-statement.spec.ts \
  supabase/migrations/20261105120000_access_follows_current_role.sql supabase/tests/tenant-isolation.sql \
  supabase/functions/_shared/workingRole.ts src/test/edge/working-role.test.ts scripts/date-guard.sh src/lib/run-or-toast.ts; do
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
need_text src/components/ui/input.tsx "useAutoLabel"
need_text src/components/ui/input.tsx "DateInput"
need_text src/components/ui/select.tsx "useAutoLabel"
need_text src/components/ui/button.tsx 'size === "icon" ? props.title'
need_text src/pages/CompanyDetail.tsx "exportUnifiedStatement"
need_text supabase/functions/ai-executive-summary/index.ts "requireWorkingRole"
need_text supabase/functions/extract-receipt-data/index.ts "requireWorkingRole"
need_text src/store/slices/loadSlice.ts "upsertById"
need_text .github/workflows/quality.yml "date-guard.sh"
need_text src/App.tsx "DirectionProvider"
need_text src/App.tsx 'MotionConfig reducedMotion="user"'
need_text src/App.tsx "useScrollRegions"
need_text tailwind.config.ts "hoverOnlyWhenSupported"
need_text src/index.css "prefers-reduced-motion: reduce"
need_text src/index.css ".stat-tile { container-type: inline-size; }"
need_text src/hooks/use-mobile.tsx "useSyncExternalStore"
need_text src/pages/Dashboard.tsx "DeferUntilVisible"
need_text src/main.tsx "installErrorReporting()"
need_text src/lib/logger.ts "addSink"
need_text src/App.tsx 'path="/errors"'
need_text supabase/functions/admin-otp/index.ts "Retired on 6 November 2026"
need_text supabase/functions/daily-digest/index.ts "digest_token_ok"
need_text supabase/config.toml "[functions.daily-digest]"

[ "$fail" = 0 ] && echo "Protected files and behaviours present."
exit "$fail"
