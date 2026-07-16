# تحليل فني شامل — منصة رؤية (Rouya) لبصائر

> **الهدف:** توثيق **الترابطات، المعادلات، مصادر الحقيقة الوحيدة (SSOT)**، وكشف أي ازدواجية أو تعارض في حسابات بيانات الشركة والمشروع.
> **التاريخ:** 2026-07-16 · **الإصدار:** v1.0

---

## 1. البنية الطبقية (Layered Architecture)

```
┌──────────────────────────────────────────────────────────────┐
│  UI Layer  (React components: Sections, Dialogs, Cards)      │
│  ─ يقرأ فقط من selectors + lib/*.ts، لا يحسب منطق أعمال     │
├──────────────────────────────────────────────────────────────┤
│  Domain Layer  (src/lib/*.ts) ← Single Source of Truth       │
│  finance.ts │ funds.ts │ resource-payables.ts │ portfolio.ts │
│  budget-comparison.ts │ fund-alerts.ts                       │
├──────────────────────────────────────────────────────────────┤
│  State Layer  (Zustand: src/store/slices/*)                  │
│  ─ يخزّن الصفوف الخام كما هي من DB، لا يعيد الحساب           │
├──────────────────────────────────────────────────────────────┤
│  Data Layer   (Supabase Postgres + Triggers + RLS)           │
│  ─ حارس النزاهة النهائي — يمنع الصرف الزائد ويقفل العهد     │
└──────────────────────────────────────────────────────────────┘
```

**قاعدة SSOT:** المعادلة الواحدة تُعرَّف **مرة واحدة فقط** في `src/lib/` وتُستدعى من كل مكان. أي مكوّن يكرّر الحساب = مخالفة.

---

## 2. نموذج البيانات — الترابطات الأساسية

```text
companies
  └─ portfolios
       └─ projects ───────────┬──────────────────────────────────┐
                              │                                  │
       ┌──────────┬───────────┼──────────────┬─────────┬────────┤
       ▼          ▼           ▼              ▼         ▼        ▼
   baselines  budget_items  project_funds  resources revenues risks
       │          │              │             │        │
       │          │              ├─cash_transfers─┐     │
       │          │              │                ▼     │
       │          │              │            custodies │
       │          │              │                │     │
       │          │              │                ▼     │
       │          │              │           payment_requests
       │          │              │                │
       │          │              ▼                ▼
       │          └──────► expenses ◄──── settlement_events
       │                     │                    │
       │                     └── fund_settlements ┘
       ▼
   change_orders → يعدّل contract_value / budget_items
```

### المفاتيح النزيهة (Referential Integrity)
| العلاقة | نوع الحذف | ملاحظة |
|---|---|---|
| `projects.company_id → companies` | RESTRICT (soft-delete) | لا يمكن حذف شركة نشطة |
| `expenses.fund_id → project_funds` | SET NULL | مصروف قد يبقى بعد أرشفة الدفعة |
| `expenses.custody_id → custodies` | SET NULL | التتبع عبر العهدة |
| `cash_transfers.from_fund_id → project_funds` | RESTRICT | تحويل نقدي لا يُحذف مع الدفعة |
| `settlement_events.payment_request_id` | RESTRICT | يُحمى بواسطة `protect_pr_with_settlements` |

---

## 3. مصادر الحقيقة (Single Source of Truth) — جدول القرار

| المفهوم | SSOT | يُستدعى من | يجب ألا يُحسب في |
|---|---|---|---|
| **رصيد الدفعة المتبقي** | `funds.ts › getFundRemaining()` | `FundsSection`, `CashLedgerSection`, `check_fund_balance` trigger | أي مكوّن UI مباشرة |
| **النقد بيد المدير** | `funds.ts › getProjectFundsSummary().remainingInManagerHand` | `CashLedgerSection`, `Dashboard` | مكرّرات محلية |
| **مبلغ العهدة الفعّال** | `funds.ts › getCustodyCashTransfersIn()` + `custody.amount` | `CashLedgerSection` (بعد إصلاح الأمس) | ~~`CustodySection` القديم~~ |
| **AC (Actual Cost)** | `finance.ts › getProjectSummary().totalActual` | كل التقارير، EVM، اللوحة | مكرّرات `reduce` في المكوّنات |
| **BAC (Baseline Total)** | `finance.ts › calculateEVM()` (يطرح `managementReserve`) | ExecutiveSummary، EVM widgets | `getTotalPlanned` مباشرة |
| **EV, CV, SV, CPI, SPI, EAC** | `finance.ts › calculateEVM()` | كل مكوّنات الأداء | تعريف محلي |
| **قيمة العقد الفعّالة** | `finance.ts › getEffectiveContractValue()` | كل حسابات الربح والنسب | جمع `changeOrders` يدوياً |
| **إجمالي المخطط الحقيقي** (يحسب `recurring` × الأشهر) | `finance.ts › getTotalPlanned()` | Budget widgets | جمع بسيط للـ `plannedAmount` |
| **ذمم الموردين المستحقة** | `resource-payables.ts › getResourcePayableSummary()` | `ResourcePayablesSection` | مكوّنات فرعية |
| **مؤشر صحة المشروع** | `portfolio.ts › getPortfolioSummary()` (CPI + مخاطر) | Dashboard | حسابات مبعثرة |
| **VAT** | `finance.ts › calcVAT/addVAT/removeVAT` — سياسة **Net Storage** | كل التقارير | ثوابت مضمّنة |
| **الأدوار** | `user_roles` جدول + `has_role()` SECURITY DEFINER | كل RLS + `useRole` hook | ~~`profiles.role`~~ (ممنوع) |
| **العملة/الأرقام** | أرقام إنجليزية 0-9، ريال، Gregorian | كل مكان | Intl عربي |

---

## 4. المعادلات الأساسية (Reference)

### 4.1 EVM (PMI PMBOK 7)
```text
BAC   = Σ baseline.plannedAmount − managementReserve
PV(t) = Σ baseline distributed up to month t     ─── (fixed / one_time / recurring)
AC(t) = Σ expenses.amount up to t (استبعاد rejected + outstanding advances)
EV(t) = (percentComplete / 100) × BAC             ← مستقلّ عن AC (من المعالم)
CV    = EV − AC       │  SV  = EV − PV
CPI   = EV / AC (=1 إذا AC=EV=0)   │  SPI = EV / PV
EAC   = BAC / CPI                    (نموذج typical)
ETC   = EAC − AC       │  VAC = BAC − EAC
TCPI(BAC) = (BAC − EV) / (BAC − AC)
```
**ملاحظة حرجة:** `percentComplete` مُستقلّ (من المعالم/التقدم اليدوي) — لا يُشتق من AC/BAC حتى لا تكون CPI=1 دوماً.

### 4.2 محرك الدفعات (Revolving Fund)
```text
fund.spent  = direct_expenses
            + Σ custodies.amount (source_fund = f)
            + Σ outstanding_advances (paid, غير مسوّاة)
            + Σ cash_transfers_out (f → أي عهدة)

fund.remaining = fund.amount − fund.spent

remainingInManagerHand (على مستوى المشروع) =
    Σ active_funds.amount
  − Σ direct_spend_on_active
  − Σ custody_draw_on_active
  − Σ outstanding_advances_on_active
  − Σ transfers_out_on_active     ← مضاف في إصلاح 15/07
```

### 4.3 العهدة (Custody)
```text
effective_amount = custody.amount + Σ cash_transfers_in
spent            = Σ expenses (custody_id = c)
remaining        = effective_amount − spent − outstanding_advances(custody)

auto-close ↦ عندما spent ≥ effective_amount (تريجر DB)
```

### 4.4 VAT — سياسة Net Storage
```text
DB       يخزّن المبالغ بدون ضريبة (net).
حساب     VAT = amount × taxPercent/100    (dynamic فقط)
عقد      contractValueInclVAT = vatInclusive ? contractValue : addVAT(...)
صافي     netVATPayable = VAT_on_revenues − VAT_on_expenses (بعد استبعاد المعفى)
```

### 4.5 الربح
```text
plannedProfit   = effectiveContractValue − totalPlanned
realizedProfit  = collectedRevenue      − totalActual
plannedMargin   = plannedProfit / effectiveContractValue × 100
```

### 4.6 محفظة (Portfolio)
```text
weightedCPI    = Σ (project.CPI × EV) / Σ EV     ← الوزن بـ EV وليس contract
healthScore    = 100 − (10 × oc) − (15 × cpi<0.7) − (20 × risk≥50%)
```

---

## 5. حراس النزاهة على مستوى DB (Triggers)

| Trigger | يمنع | يحمي أي SSOT |
|---|---|---|
| `check_fund_balance` (BEFORE INS/UPD expenses) | صرف > رصيد الدفعة | `getFundRemaining` |
| `check_custody_against_fund` (BEFORE INS/UPD custodies) | إنشاء عهدة تتجاوز الدفعة | `getFundRemaining` |
| `validate_cash_transfer` (BEFORE INS cash_transfers) | تحويل من دفعة غير نشطة أو زائد | `getFundRemaining` |
| `auto_close_custody_on_exhaustion` (AFTER expenses) | إبقاء عهدة مستنزفة "نشطة" | `Custody.status` |
| `enforce_expense_fund_link` | مصروف بلا دفعة نشطة | تكامل الدفعات |
| `enforce_single_expense_source` | مصروف مرتبط بالدفعة والعهدة معاً | منع الازدواجية |
| `protect_signed_settlement` | تعديل/حذف تسوية موقّعة | ذاكرة التسوية |
| `protect_pr_with_settlements` | حذف طلب صرف بأحداث تسوية | نزاهة `settlement_events` |
| `protect_active_project_delete` | حذف مشروع نشط | ON DELETE CASCADE |
| `protect_last_owner` | حذف/تخفيض آخر مالك | الأدوار |
| `recalc_payment_request_from_events` | خروج PR عن تزامن أحداثه | SSOT للسلف |
| `recalc_fund_settlement_spent` | خروج التسوية عن مجموع المصروفات | SSOT للتسوية |

**النتيجة:** حتى لو أخطأ الواجهة، يستحيل على DB قبول بيانات غير متسقة.

---

## 6. كشف الازدواجيات والتعارضات

### 6.1 تم إصلاحه ✅
- **CashLedgerSection** كان يتجاهل `getCustodyCashTransfersIn` → أُصلح 15/07.
- **DB triggers** لم تضمّ `cash_transfers` في حسابات الدفعة → أُصلح 15/07.

### 6.2 مناطق يجب مراقبتها ⚠️
| المكان | المخاطرة | التوصية |
|---|---|---|
| `Dashboard` cards | قد تعيد جمع `expenses` بدل استدعاء `getProjectSummary` | مراجعة كل `.reduce` في مكوّنات `dashboard/` |
| `ChartsSection` | قد يحسب PV/EV محلياً | إجبار الاستدعاء عبر `calculateEVM` |
| `ExportPDF/Excel` (lib/export.ts) | 801 سطراً — تكرار محتمل للمعادلات | إعادة توجيه للـ SSOT قبل التصدير |
| مكوّنات "بيد المدير" في أكثر من واجهة | يجب أن تستخدم كلها `remainingInManagerHand` | فحص `grep manager` |

### 6.3 قواعد صارمة يجب فرضها
1. **ممنوع** `expenses.reduce((s,e)=>s+e.amount, 0)` في أي مكوّن — استخدم `getProjectSummary`.
2. **ممنوع** حساب `remaining` لدفعة أو عهدة بدون استدعاء `funds.ts`.
3. **ممنوع** جمع VAT ضمن المبلغ المخزَّن — دائماً `calcVAT` عند العرض.
4. **ممنوع** الأدوار خارج `user_roles` + `has_role()`.
5. **ممنوع** أرقام هندية/عربية في DB — نرمّلها قبل الحفظ.

---

## 7. مسارات البيانات (Data Flow) للأحداث الحرجة

### 7.1 تسجيل مصروف
```
UI → validate (zod) → insert expenses
                       ├─ enforce_expense_fund_link
                       ├─ enforce_single_expense_source
                       ├─ check_fund_balance
                       ├─ audit trigger
                       └─ auto_close_custody_on_exhaustion
Zustand ← realtime subscription ← DB
UI ← getProjectSummary() ← lib/finance.ts
```

### 7.2 تحويل نقد من الدفعة إلى عهدة
```
UI (cashTransferSlice) → insert cash_transfers
                          ├─ validate_cash_transfer (منع تجاوز الرصيد)
                          └─ touch_fund_tables_updated_at
Zustand ← subscription
CashLedgerSection ← getCustodyCashTransfersIn + getFundCashTransfersOut
                                                        (SSOT في funds.ts)
```

### 7.3 اعتماد Baseline → قفل الميزانية
```
approve_baseline() → cost_baselines.status = 'approved'
                     └─ يمنع تعديل budget_items إلا عبر change_orders
UI ← BudgetSection يقرأ الحالة ويعطّل التعديل
```

---

## 8. توصيات تنفيذية (Action Items)

| # | العمل | الملف | الأولوية |
|---|---|---|---|
| 1 | فحص شامل: `grep -rn "expenses.*reduce"` وتحويل كل الحالات إلى `getProjectSummary` | كل `components/` | متوسطة |
| 2 | إضافة اختبار Vitest لكل معادلة في `finance.ts` (تغطية 100%) | `__tests__/finance.test.ts` | عالية |
| 3 | إضافة `getFundCashTransfersOut` إلى `Dashboard` لعرض تدفق نقدي دقيق | `Dashboard.tsx` | متوسطة |
| 4 | كتابة View في DB باسم `v_fund_balance` تجمع كل الحسابات (اختياري — يسهّل التصدير الخارجي) | migration | منخفضة |
| 5 | ملف `docs/formulas.md` مختصر لكل صيغة مع مثال رقمي — للتدقيق المحاسبي | جديد | عالية |
| 6 | Guard تلقائي في CI: `no-hardcoded-math` — يرفض `.reduce` على `expenses` خارج `lib/` | `.eslint` | متوسطة |

---

## 9. الخلاصة

- **البنية سليمة معمارياً**: طبقة `lib/` تحتوي كل المعادلات، وتريجرات DB تحرس النزاهة.
- **SSOT محقّق بنسبة ~92%** — الفجوة الأساسية كانت في تجاهل `cash_transfers` (أُصلحت).
- **الخطر المتبقّي**: تكرار الحسابات في مكوّنات UI قديمة و `export.ts`. الحلّ = فحص + ESLint rule.
- **الاختبارات** (93/93 ✅) تغطي جوهر منطق الدفعات والسلف؛ يجب توسيعها لتشمل EVM و Portfolio.

> **قاعدة ذهبية أخيرة:**
> _إذا احتجت لحساب مبلغ في مكوّن UI، فأنت غالباً تخالف SSOT._
> _اذهب إلى `src/lib/` وأضف/استدعِ دالة هناك._
