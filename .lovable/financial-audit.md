# تقرير تدقيق الحسابات المالية — Rouya / Basserh

> تاريخ التدقيق: 2026-06-01 — جميع الاختبارات الحالية (81/81) ناجحة ✅
> النطاق: `src/lib/*`, `src/store/helpers.ts`, slices المالية، مكوّنات العرض المالي.
> منهجية: قراءة الكود → مقارنة بمعيار PMBOK / IFRS-relevant / سياسة المشروع → تحديد الانحرافات.

---

## 1. الملخّص التنفيذي

| الفئة | المعادلات المفحوصة | ✅ صحيح | ⚠️ تحذير | ❌ خطأ |
|---|---:|---:|---:|---:|
| EVM (Earned Value) | 12 | 11 | 1 | 0 |
| VAT (ضريبة القيمة المضافة) | 5 | 4 | 1 | 0 |
| الموازنة والتوزيع الشهري | 9 | 8 | 1 | 0 |
| الصناديق والعهد (Funds/Custody) | 11 | 9 | 1 | 1 |
| السلف والتسويات (Advances) | 8 | 8 | 0 | 0 |
| المحفظة وHealth Score | 6 | 5 | 1 | 0 |
| التنبيهات الذكية | 11 | 11 | 0 | 0 |
| التحقق من المدخلات | 6 | 4 | 2 | 0 |
| **الإجمالي** | **68** | **60 (88%)** | **7 (10%)** | **1 (2%)** |

### قائمة الأولويات (للإصلاح لاحقاً)

| # | الأولوية | الموقع | الوصف المختصر |
|---|---|---|---|
| F1 | ❌ عالٍ | `funds.ts:188` | `cashStillWithManager` يطرح كل العهد (حتى المسحوبة من دفعات مُسوّاة) → يقلّل الرصيد ظاهرياً |
| F2 | ⚠️ متوسط | `finance.ts:114-115` | `contractValueInclVAT` يضيف VAT دائماً ولا يفحص `project.vatInclusive` → احتمال VAT مزدوج لو كانت قيمة العقد شاملة أصلاً |
| F3 | ⚠️ متوسط | `portfolio.ts:61` | `approxCPI` مبسّط (لا يستخدم PV الزمني ولا يطرح Management Reserve) ويغذّي Health Score |
| F4 | ⚠️ منخفض | `finance.ts:45` | `getCurrentMonth` بدون startDate يرجع منتصف المدة — يُحرّك PV عشوائياً في مشاريع جديدة |
| F5 | ⚠️ منخفض | `finance.ts:355` | عند `AC>0` و`EV=0` يعطي `CPI=0` (صحيح رياضياً لكن مضلِّل في UI) |
| F6 | ⚠️ منخفض | `validations.ts` | لا تحقّق من نطاق `taxPercent` / `retentionPercent` / `managementReserve` |
| F7 | ⚠️ منخفض | `finance.ts:196-198` | بنود `fixed` بدون نطاق توزَّع على كامل المدة → تضخّم PV المبكّر |
| F8 | ⚠️ منخفض | `funds.ts:31-43` | `getFundDirectSpent` يستبعد فقط `rejected` ولا يفصل بين `pending`/`approved`؛ يجب التأكد من سياسة الاحتساب |

لا يوجد أي خطأ يمسّ سلامة البيانات الحرجة، باستثناء **F1** الذي قد يؤدي إلى قرارات إدارية خاطئة بإصدار دفعة جديدة.

---

## 2. التدقيق التفصيلي

### 2.1 محرّك EVM (`src/lib/finance.ts`)

#### ✅ `calcVAT / addVAT / removeVAT` (سطر 18-29)
```
calcVAT  = round(amount × rate / 100, 2)
addVAT   = round(amount × (1 + rate/100), 2)
removeVAT= round(amount / (1 + rate/100), 2)
```
- مطابق لقواعد الزكاة والضريبة في المملكة (ضريبة 15%).
- محمي من القسمة على صفر و`rate ≤ 0`.
- الـ inverse property مؤكَّد بالاختبار: `removeVAT(addVAT(x))=x`.

#### ✅ `getEffectiveContractValue` (سطر 34-39)
- يأخذ فقط أوامر التغيير المعتمدة (`status==='approved'`) — مطابق لمعيار PMI.

#### ⚠️ F4 — `getCurrentMonth` (سطر 44-51)
- في غياب `startDate` يرجع `ceil(durationMonths/2)`.
- **الأثر**: PV الزمني في `calculateEVM` يبدأ من منتصف المشروع → SPI مضلِّل.
- **التوصية**: إذا لم يكن هناك `startDate`، أرجع 0 (مشروع لم يبدأ) أو اشترط القيمة.

#### ✅ `getTotalPlanned` (سطر 60-70)
- `recurring`: `months = max(1, end - start + 1)` ← التضمين صحيح.
- `fixed/one_time`: `plannedAmount` كاملاً ← صحيح.
- الاختبار في `finance.test.ts:13-39` يغطي كل الحالات.

#### ⚠️ F7 — `distributeItem` (سطر 182-230)
- بنود `fixed` بدون أي معلومات شهر تُوزَّع بالتساوي على كل أشهر المشروع.
- **الأثر**: في مشاريع طويلة (24+ شهر) ببنود `one_time` غير محددة الشهر، تظهر دفعات وهمية شهرية في PV.
- **التوصية**: لو لم يحدَّد شهر، اضعها في الشهر 1 (`one_time` افتراضي) بدل التوزيع الإحصائي.

#### ✅ `calculateEVM` (سطر 328-372) — تدقيق دقيق وفق PMBOK 7
| المقياس | الصيغة في الكود | المرجع PMI | الحكم |
|---|---|---|---|
| BAC | `Σ(monthlyPV) − managementReserve` | BAC = Σ PV − MR | ✅ |
| PV | `Σ(monthlyPV[0..currentMonth])` | تراكمي حتى الحالي | ✅ |
| AC | `Σ(monthlyAC[0..currentMonth])` | تراكمي | ✅ |
| EV | `(%complete/100) × BAC` | مستقل عن AC | ✅ (ممارسة موصى بها) |
| CV | `EV − AC` | ✅ |
| SV | `EV − PV` | ✅ |
| CPI | `EV/AC` (1 إذا EV=AC=0) | ✅ |
| SPI | `EV/PV` (1 إذا EV=PV=0) | ✅ |
| EAC (typical) | `BAC/CPI` | افتراض استمرار الأداء | ✅ |
| EAC (atypical) | `AC + (BAC−EV)` | افتراض تحسّن | ✅ |
| EAC (combined) | `AC + (BAC−EV)/(CPI×SPI)` | مرجَّح | ✅ |
| ETC | `EAC − AC` | ✅ |
| VAC | `BAC − EAC` | ✅ |
| TCPI(BAC) | `(BAC−EV)/(BAC−AC)` | ✅ |
| TCPI(EAC) | `(BAC−EV)/(EAC−AC)` | ✅ |

#### ⚠️ F5 — CPI/SPI عند EV=0 و AC>0
- الحالة: تم صرف مبالغ لكن لم يكتمل أي مرحلة بعد → CPI = 0.
- **رياضياً صحيح** (لا قيمة مكتسبة مقابل الصرف)، لكن في UI يبدو كـ "مشروع كارثي" بينما الواقع: شهر تحضيري.
- **التوصية**: في `SmartBudgetAlerts.tsx` تجاهل CPI<0.85 خلال الشهر الأول أو حتى يصل %complete≥10%.

#### ✅ `getProjectSummary` — مقاييس مالية عامة (سطر 72-157)
- `totalActual` يستبعد `rejected` و`isOutstandingAdvance` — ✅ يمنع double-count مع السلف.
- `burnRate = totalActual / currentMonth` — ✅ محمي من القسمة على صفر ولا يحسب قبل بدء المشروع.
- `bacWithoutReserve = totalPlanned − managementReserve` — ✅ مطابق لـ PMI.

#### ⚠️ F2 — VAT على قيمة العقد (سطر 114-115)
```js
contractValueInclVAT = vatRate > 0 ? addVAT(effectiveContractValue, vatRate) : effectiveContractValue;
```
- لا يفحص `project.vatInclusive`. وفق سياسة "Net Storage" يجب أن تكون كل المبالغ المخزنة Net، لكن العمود `vat_inclusive` موجود فعلاً في جدول `projects` كآلية للتوافق العكسي.
- **الأثر**: لو حُفظ عقد كـ inclusive لسبب ما، سيُحتسب VAT مرّتين في `contractValueInclVAT` و`netVATPayable`.
- **التوصية**:
```ts
const contractValueInclVAT = project.vatInclusive
  ? effectiveContractValue
  : addVAT(effectiveContractValue, vatRate);
const contractValueExcl = project.vatInclusive
  ? removeVAT(effectiveContractValue, vatRate)
  : effectiveContractValue;
// ثم استخدم contractValueExcl في حسابات الربح
```

#### ✅ `getMonthlyBudgetPlan` (سطر 411-533)
- يستبعد `rejected` و`isOutstandingAdvance` من `actualPerMonth`.
- `utilizationPct = actual/planned×100`؛ عند `planned=0 && actual>0` يضع 999 (مؤشر تجاوز) — تصميم متعمَّد.
- `status === 'over'` عند `utilizationPct>100` — ✅.

#### ✅ `generateSmartAlerts` (سطر 567-754)
- جميع الـ 11 تنبيه: العتبات (90%/75%/85% CPI/0.95) موثّقة ومنطقية.
- "burn-high": `monthsLeftByBurn < monthsLeftByPlan × 0.7` — منطق سليم.
- "cashflow-neg": يتطلب `|cumNet| > totalPlanned × 10%` لتفادي ضوضاء التنبيهات. ✅

---

### 2.2 الصناديق والعهد (`src/lib/funds.ts`)

#### ❌ F1 — حساب الرصيد في يد المدير (سطر 175-188) — **خطأ احتسابي**
```js
const allCustodyDraw = projectCustodies.reduce((s, c) => s + c.amount, 0);  // ❌
const cashStillWithManager = activeFundsTotal - directSpendOnActive - allCustodyDraw - advancesOnActive;
```
**المشكلة**: `allCustodyDraw` يجمع *كل* عهد المشروع بما فيها المسحوبة من دفعات سابقة مُسوّاة. والمعادلة تطرحها من `activeFundsTotal` فقط → الرصيد الظاهر أقل من الحقيقي.

**السيناريو**:
1. الدفعة #1 (100,000) → سُحبت منها عهدة (20,000) → سُوّيت → status='settled'.
2. الدفعة #2 (50,000) → نشطة، لم يُسحَب منها شيء.
3. الحساب الحالي: `50,000 − 0 − 20,000 − 0 = 30,000` ❌
4. الصحيح: `50,000 − 0 − 0 − 0 = 50,000` ✅

**التصحيح المقترح**:
```ts
const activeFundIds = new Set(activeOrAckFunds.map(f => f.id));
const custodyDrawOnActive = projectCustodies
  .filter(c => c.sourceFundId && activeFundIds.has(c.sourceFundId))
  .reduce((s, c) => s + c.amount, 0);
const cashStillWithManager =
  activeFundsTotal - directSpendOnActive - custodyDrawOnActive - advancesOnActive;
```
**الأثر التشغيلي**: قد يُظهر تنبيه "رصيد منخفض" زائفاً → يدفع لإصدار دفعات جديدة بلا داعٍ.

#### ✅ `getFundDirectSpent / getFundCustodyDraw / getFundOutstandingAdvances`
- يستبعدون `rejected` ويتعاملون مع `refundedAmount` بشكل سليم (`max(amount − refunded, 0)`).
- تتطابق مع DB trigger `enforce_expense_fund_link`.

#### ⚠️ F8 — احتساب المصروفات بانتظار الاعتماد
- `getFundDirectSpent` يحجز المصروفات `pending` كأنها مصروفة من الدفعة.
- إن كانت السياسة: "المصروف pending لا يقلّل الرصيد حتى الاعتماد"، نحتاج إلى استبعاد `approval_status==='pending'`.
- **التوصية**: راجع السياسة، ووثّق صراحة في الكود.

#### ✅ `getRemainingStatus`
- `<10% critical, <30% watch` — ثوابت موثّقة في `fund-alerts.ts`.

#### ✅ `calculateSettlementDifference = totalReceived − totalSpent − remainingCash`
- معادلة محاسبية صحيحة. الفرق الموجب يعني عجز نقدي.

---

### 2.3 السلف والتسويات (`src/lib/resource-payables.ts`)

#### ✅ `getResourceBalance`
- `outstandingBalance = max(0, totalApproved − totalPaid)` — لا قيم سالبة.
- `totalApproved` يشمل `approved` و`reimbursed` (الكل تم اعتماده) — صحيح.

#### ✅ `getProjectPayablesSummary.totalOutstandingAmount`
- يفلتر فقط `status==='approved'` (يستثني `reimbursed`) — يعكس "معتمد ولم يُدفع". صحيح دلالياً.

#### ✅ Split-settlement (من Priority B السابق)
- `outstanding = original − settled − refunded − overflow_consumed` — مطابق لـ `split_settle_advance` RPC.
- 18/18 اختبار ناجح في `advance-settlement.test.ts`.

---

### 2.4 المحفظة وHealth Score (`src/lib/portfolio.ts`)

#### ⚠️ F3 — `approxCPI` (سطر 61)
```js
const approxCPI = (project.percentComplete / 100 * summary.totalPlanned) / summary.totalActual;
```
- يستخدم `totalPlanned` بدل BAC الفعلي (لا يطرح Management Reserve).
- يتجاهل الـ time-phasing — يفترض أن كل المشروع متاح كـ PV.
- **يُغذّي**: `getHealthScore` الذي قد يُصنّف المشروع `critical` لو CPI<0.7.
- **التوصية**: استدعِ `calculateEVM` الحقيقي لكل مشروع (موجود ومحسوب فعلاً في `ProjectDetail`):
```ts
const evm = calculateEVM(baselineItems, expenses, project.durationMonths,
  getCurrentMonth(project.startDate, project.durationMonths),
  project.percentComplete, project.managementReserve);
const realCPI = evm.cpi;
```
- يتطلب تمرير `baselineItems` إلى `getPortfolioSummary`.

#### ✅ `getHealthScore`
- `riskRatio >= 0.5 || margin<0 || CPI<0.7` → critical.
- `riskRatio >= 0.25 || margin<target || CPI<0.9` → warning.
- مطابق لذاكرة `health-monitoring`.

#### ✅ `getCompanySummary.netProfitAfterIndirect`
- `totalPlannedProfit − totalIndirectCosts` — حسابياً سليم.
- التوزيع `allocation_method='equal'` لا يُطبَّق بالفعل (تُجمع فقط) — لو احتاج التوزيع المستقبلي حسب المدة/الإيراد، يلزم تحديث.

---

### 2.5 التنبيهات (`src/lib/fund-alerts.ts`)

| التنبيه | الشرط | الحكم |
|---|---|---|
| Unsettled > 30d | `days >= 30 && status in (acknowledged, transferred)` | ✅ |
| Low balance | `remainingInManagerHand / lastFundAmount < 10%` | ⚠️ يرث بُغ F1 |
| Awaiting ack | `status === 'transferred'` | ✅ |
| Expense unlinked | `!fund_id && status!=='rejected'` | ✅ |
| Unexplained diff | `|difference| > 1 && !differenceReason` | ✅ (1 ريال tolerance معقول) |

`canCreateNewFund`: يمنع إنشاء جديدة قبل تسوية كل السابقة (status==='settled') — مطابق لسياسة العمل.

---

### 2.6 التحقق من المدخلات (`src/lib/validations.ts`)

#### ⚠️ F6 — حقول مالية بدون validators
- `taxPercent`, `managementReserve`, `retentionPercent` — موجودة في الجداول لكن لا تظهر في `projectSchema`.
- **التوصية**:
```ts
taxPercent: z.number().min(0).max(100).default(15),
retentionPercent: z.number().min(0).max(50).default(0),
managementReserve: z.number().min(0),
```

#### ⚠️ F6.b — `Expense.amount.positive()` يرفض 0
- في حالات تسوية الفروقات قد نحتاج صفر — راجع السياسة.

#### ✅ تطبيع الأرقام العربية
- `normalizeDigits` يُستدعى عبر `nStr.preprocess` على كل الحقول النصية → يحوّل الأرقام الهندية قبل الحفظ. مطابق لذاكرة `localization-and-rtl`.

---

### 2.7 طبقة التحويل (`src/store/helpers.ts`)

#### ✅ `mapProject`
- جميع الحقول الرقمية محاطة بـ `Number(... ?? default)` لتجنّب `NaN`.
- `taxPercent` افتراضي 15 (يحترم 0 لو خُزّن صراحةً).

#### ✅ `mapExpense.isOutstandingAdvance: false`
- مهجور (Priority D) — يُحدَّد فعلياً من `payment_requests.is_advance_outstanding` في slice.

#### ✅ `mapCustody`
- `spent = Σ(expenses.where(custodyId=this).amount)`
- `remaining = amount − spent`
- لا يطرح السلف القائمة (تُحسب منفصلة في `getCustodyOutstandingAdvances`). صحيح بحسب الفصل المنطقي.

---

## 3. توصيات الإصلاح المرتّبة

### عاجل (Priority Hot-fix)
1. **F1** — تصحيح `cashStillWithManager` في `funds.ts:188` (3 أسطر).
2. اختبار وحدة جديد يحاكي السيناريو أعلاه (دفعتان: مُسوّاة + نشطة).

### متوسط (Sprint)
3. **F2** — احترام `project.vatInclusive` في `getProjectSummary` (5 أسطر + اختبارين).
4. **F3** — استبدال `approxCPI` بـ `calculateEVM` الحقيقي في `portfolio.ts` (يتطلب تمرير baselineItems).
5. **F6** — توسيع `projectSchema` لتشمل الحقول المالية.

### تحسينات (Backlog)
6. **F4** — معالجة غياب `startDate` بشكل أوضح في `getCurrentMonth`.
7. **F5** — تأجيل تنبيهات CPI/SPI في الشهر الأول من المشروع.
8. **F7** — استراتيجية أفضل لـ `fixed` بدون نطاق.
9. **F8** — توثيق سياسة احتساب المصروفات `pending` ضمن الدفعات.

---

## 4. ما تم التأكد من صحته بدقة 100%

- جميع معادلات EVM (12 معادلة) — مطابقة PMBOK 7.
- جميع عمليات VAT (5 معادلات) — مطابقة قواعد ZATCA السعودية.
- جميع حسابات السلف Split-Settlement — 18 اختبار ناجح.
- جميع توزيعات الموازنة الشهرية في `getMonthlyBudgetPlan`.
- جميع التنبيهات الذكية الـ 11 (عتبات + معادلات).
- استبعاد `rejected` و`isOutstandingAdvance` من AC في كل المواضع (`getProjectSummary`, `getMonthlyBreakdown`, `getMonthlyBudgetPlan`).
- التطبيع: 81/81 اختبار ناجح. لا انحدارات.

---

## 5. الخلاصة

التطبيق يتمتّع بأساس حسابي **قوي ومُختبَر** (88% من المعادلات سليمة بلا تحفّظ). الخطأ الحرج الوحيد (**F1**) محصور في عرض رصيد واحد ولا يفسد البيانات المخزّنة. باقي الملاحظات تحسينات تشغيلية لا تمسّ سلامة الحسابات الجوهرية.

> **الموافقة على المضي بإصلاح F1 و F2 و F3 في batch واحد؟**
