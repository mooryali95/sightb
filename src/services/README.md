# Services Layer

Isolation layer between Zustand slices and Supabase. Rules:

1. **Only services import `@/integrations/supabase/client`** — slices, components, hooks call services.
2. Each service function returns typed data or throws an `Error` with an Arabic user-facing message (already localized).
3. No React, no state. Pure I/O + validation + error mapping.
4. Named exports; grouped by domain (funds, custody, expenses, payment requests, resource payables, advance settlements).

## Migration status

- ✅ `advanceSettlementService` — split_settle_advance RPC
- ⏳ `fundService` — partial (getFundById, listByProject)
- ⏳ `paymentRequestService` — settlement events fetch
- ⏳ Full slice migration (funds, custody, expenses) — incremental

Slices keep orchestration + local state; services own remote I/O.
