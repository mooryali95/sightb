## 1) تشخيص المشكلة الظاهرة في الصور

**البيانات الفعلية للدفعة #4 (من DB):**
- المبلغ = 5,000 — الحالة = `acknowledged`
- تحويل نقدي صادر إلى عهدة = **5,000** (سجل واحد في `cash_transfers`)
- مصروف مباشر / عهدة / سلف = 0
- إذن الرصيد الحقيقي = 0 → لهذا يرفض تريجر `check_fund_balance` مصروف 1,000 (رسالة "المتاح: 0" في الصورة 1 صحيحة على مستوى DB).

**لكن في الواجهة (الصورتين 2 و 3):**
- كارت الدفعة #4 يعرض "متبقي بيد المدير: **5,000 ر.س**"
- سطر الجدول يعرض "المتبقي: **5,000 ر.س**، المصروف 0"
- عنصر الـ Dropdown في نموذج المصروف يعرض "متبقي: 5,000"

**الخلاصة:** DB (مصدر الحقيقة) صحيح، لكن ثلاث نقاط في الـ UI تحسب "المتبقي" بطريقة **لا تخصم `cash_transfers` الصادرة من الدفعة عندما تكون العهدة الهدف = مصدرها نفس الدفعة**، أو تعتمد على منطق مختلف عن `getFundRemaining`. النتيجة: تناقض ظاهري بين "المتاح للصرف" و"الرصيد المتبقي" — كسر لمبدأ SSOT.

بالتوازي، النموذج يفتقد سيناريوهين ماليين مطلوبَين:
- **إغلاق سلفة مورد بمصروف فعلي** (تحويل السلفة القائمة إلى مصروف موثّق مرتبط بنفس المورد).
- **تسجيل ما دفعه المورد من جيبه لصالح المشروع** (Payable على المشروع) لاسترداده لاحقاً من دفعة/عهدة قادمة.

---

## 2) الخطة على 3 محاور

### المحور A — توحيد SSOT للدفعة (إصلاح جذري، لا Patch)

الفكرة: **تعريف واحد فقط** لـ `remaining(fund)` يستخدمه الجميع (Dropdown، الكارت، الجدول، شريط التوزيع، الـ trigger).

خطوات:
1. توحيد المصدر في `src/lib/funds.ts`:
   - إعادة كتابة `getFundSpent` بحيث تنتج **بالضبط** نفس رقم `check_fund_balance` في DB.
   - إضافة helper واحد `getFundRemainingBreakdown(fund, …)` يعيد كائناً: `{ direct, custodyDraw, advances, cashOut, spent, remaining }` لاستهلاكه من كل مكان بدون إعادة الحساب.
2. مطاردة كل `getFundRemaining` أو حسابات ad-hoc واستبدالها:
   - `CashLedgerSection.tsx` (السطور 249، 295، 338–376): استخدام `remaining` من الـ breakdown الجديد.
   - `ExpensesSection.tsx` (السطور 77–79، 423، 461): إعادة الاعتماد على نفس الـ breakdown.
   - `FundsSection.tsx` وأي مكان يعرض "المتبقي" على مستوى الدفعة.
3. إضافة `Tooltip` على كل حقل "متبقي" يعرض التفصيل (مباشر / عهدة / سلف / تحويلات نقد) — يمنع أي التباس مستقبلي.
4. إضافة اختبار Vitest ضامن: لكل دفعة في الـ store، `UI.remaining === DB.remaining` (يستخدم قيمة الـ RPC `ssot_explain` كمرجع في الاختبارات).
5. إضافة اختبار pgTAP في `supabase/tests/ssot.pgtap.sql`: إدخال `cash_transfer` بمبلغ الدفعة كاملاً → أي INSERT في `expenses` بأي مبلغ > 0 مرفوض بـ `P0001` (حالياً الاختبار يغطي المبلغ الكبير فقط).

### المحور B — إغلاق السلفة القائمة بمصروف فعلي

الهدف: عندما يرجع المورد بفاتورة، أستطيع تحويل السلفة (Outstanding Advance) إلى مصروف موثّق مرتبط بنفس المورد، فيقفل `is_advance_outstanding` تلقائياً ولا تُخصم مرتين من الدفعة.

خطوات:
1. **UI**: في `ExpensesSection` عند اختيار مورد له سلف قائمة، إظهار قسم "تسوية سلفة" مع Select لاختيار سلفة (`payment_requests` بحالة `paid` + `is_advance_outstanding=true`) وعرض `remaining = amount − refunded_amount`.
2. **UI**: إذا اختار المستخدم السلفة، يُقفَل حقلَي `fund_id`/`custody_id` (المصدر مأخوذ من السلفة نفسها)، ويصبح المبلغ الأقصى = رصيد السلفة (تحذير + رفض تجاوز).
3. **DB** (migration جديدة):
   - إضافة عمود `expenses.settles_advance_id uuid REFERENCES payment_requests(id)` + FK + index.
   - تريجر `settle_advance_on_expense` (AFTER INSERT/UPDATE على `expenses`): يُنشئ صف `settlement_events` بنوع `advance_settlement`، ثم يُحدّث `payment_requests.refunded_amount += NEW.amount`؛ عند `refunded_amount >= amount` يُصبح `is_advance_outstanding = false`.
   - تعديل `check_fund_balance` و `enforce_single_expense_source`: عند وجود `settles_advance_id`، تُستنبط الـ fund/custody من السلفة، ولا تُضاف مرتين إلى المصروف على الدفعة (لأنها محجوزة أصلاً كـ advance).
4. **الطبقة الحسابية**: تحديث `getFundDirectSpent` لاستثناء المصروفات ذات `settlesAdvanceId` من المجموع (لأنها بديل عن سلفة قائمة، لا صرف جديد).
5. **العرض**: في تفصيل السلفة (Inspector Panel للـ Payment Request)، إظهار جدول "الفواتير التي أغلقت السلفة" مع الروابط.
6. **اختبار**: pgTAP + Vitest يغطيان الحالات: تسوية جزئية، تسوية كاملة، منع تجاوز المبلغ.

### المحور C — تسجيل "دفع المورد نيابة عن المشروع" كذمة مدينة قابلة للسداد

الهدف: المورد صرف من ماله الخاص لأن الدفعة لا تكفي — أريد تسجيله كـ **Payable على المشروع** لاستراده من أي دفعة/عهدة قادمة، دون كسر SSOT.

النموذج المفضّل: إعادة استخدام جدول `resource_reimbursements` الموجود (فيه بالفعل منطق مستحقات الموارد) وتوسعته ليشمل الموردين، بدل جدول جديد.

خطوات:
1. **DB** (migration):
   - في `resource_reimbursements`: إضافة `vendor_name text NULL` و `source_kind text CHECK IN ('resource','vendor') DEFAULT 'resource'` و `notes text`.
   - جعل `resource_id` nullable بشرط `source_kind='vendor'` (CHECK constraint).
   - GRANT عادي (authenticated/service_role) + سياسات RLS = نفس القائمة.
   - في KPI العلوي (الصورة 2 "مدفوع لمستحقات موارد 210 ر.س") يبقى نفسه، مع إضافة سطر منفصل "لمستحقات موردين" للتوضيح.
2. **UI جديدة**: في `ExpensesSection` زر ثانوي "تسجيل دفع مورد نيابةً عن المشروع":
   - ينشئ صف Payable في `resource_reimbursements` (`source_kind='vendor'`، `vendor_name`، `amount`، `description`، `date`، `invoice_ref`).
   - لا ينشئ صفاً في `expenses` (لأن المشروع لم يصرف بعد). يظهر في تبويب "المستحقات".
3. **السداد**: عند فتح Payable وضغط "سداد":
   - يظهر Dialog يختار مصدر السداد (دفعة نشطة / عهدة) → ينشئ `expenses` بمرجع `reimburses_payable_id` (عمود جديد).
   - Trigger `settle_payable_on_expense` يقفل الـ Payable ويضع `settled_at`.
4. **الطبقة الحسابية**:
   - إضافة `getProjectOutstandingPayables(projectId)` في `lib/resource-payables.ts`.
   - إظهارها في `SourceOfTruthSection` كسطر مستقل مع Source Badge → الجدول والاستعلام.
5. **CashFlowSankey**: إضافة تدفق جديد `Fund → Payable Settlement → Vendor`.
6. **اختبار**: Vitest للسيناريو الكامل (إنشاء payable → سداد جزئي → سداد كامل → تسوية دفعة).

---

## 3) ترتيب التنفيذ

1. **A أولاً** (يوم واحد): يزيل التضليل الحالي فوراً ويحمي كل السطور الأخرى.
2. **B** (يوم): يفتح حالة الاستخدام الأكثر إلحاحاً (إغلاق سلفة موجودة أصلاً في النظام).
3. **C** (يوم–يومان): إضافة قناة Payable الجديدة، مع migration + UI + اختبارات.

## 4) القبول (Acceptance)
- الدفعة #4: كل الأماكن تعرض "متبقي: 0" ومصدر واحد للحقيقة، مع Tooltip تفصيلي.
- إمكانية اختيار سلفة قائمة داخل نموذج المصروف وإغلاقها بفاتورة موردها، دون خصم مزدوج.
- ظهور Payables للموردين في تبويب "المستحقات"، مع زر سداد يخصم من دفعة/عهدة نشطة ويقفل الذمة.
- كل الاختبارات: Vitest ✅، pgTAP ✅، CI أخضر.

## 5) خارج النطاق (لا يُنفَّذ الآن)
- إعادة تصميم بصري لكارت الدفعات (يبقى كما هو).
- تغيير آلية `cash_transfers` نفسها (تبقى كما هي، فقط تُقرأ في SSOT بشكل متسق).
- تحويلات بين العهد (custody → custody).

هل توافق على البدء؟ (سأنفذ A ثم B ثم C بالترتيب في نفس الجلسة إن أذنت).
