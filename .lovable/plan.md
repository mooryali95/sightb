
## المشكلة
تحويل النقد من دفعة → عهدة يُخصم من الدفعة لكن لا يُضاف بصورة متسقة في كل الأماكن. النتيجة: 5,000 ر.س "اختفت" من كارت «بيد حاملي العُهد» ومن شريط توزيع الأموال، ومن سقف صرف العهدة في قاعدة البيانات.

## الإصلاحات

### 1) `src/components/project/CashLedgerSection.tsx` (UI)
- استبدال `activeCustodyAmount` ليستعمل **`effectiveAmount` (المبلغ الأصلي + التحويلات الواردة)**، عبر `getCustodyCashTransfersIn(c.id, projectTransfers)`.
- مضاعفة استخدامه في:
  - كارت «بيد حاملي العُهد».
  - شريط «مسار توزيع الأموال» (نسب `pct`).
- التأكد أن مجاميع الشريط (مباشر + عُهد + بيد حاملين + بيد المدير) = `totalTransferred`، وإضافة سطر توضيحي «تحويلات نقد داخلية» في وسم الشريط.

### 2) هجرة SQL — تصحيح الـ triggers لتعتمد نفس تعريف الرصيد
- **`check_fund_balance`**: عند حساب `_custody_total` أضف `+ Σ cash_transfers.amount WHERE to_custody_id = NEW.custody_id`. عند حساب رصيد الدفعة أضف `+ Σ cash_transfers.amount WHERE from_fund_id = NEW.fund_id` كخصم إضافي.
- **`check_custody_against_fund`**: أضف نفس خصم `cash_transfers` من رصيد الدفعة المصدر.
- **`auto_close_custody_on_exhaustion`**: قارن `spent >= custodies.amount + Σ cash_transfers_in`.
- **`cash_transfers` trigger جديد `validate_cash_transfer`** (BEFORE INSERT):
  - رفض إن كانت الدفعة المصدر ليست `transferred` أو `acknowledged`.
  - رفض إن كان `amount > remaining` بحساب موحّد.
  - رفض إن كانت العهدة الهدف `closed`.

### 3) اختبارات Vitest جديدة في `src/lib/__tests__/funds.test.ts`
- سيناريو: دفعة 5000 → تحويل 5000 إلى عهدة موجودة برصيد 0 → التأكد أن `remainingInManagerHand=0`، وأن `custody effectiveAmount` يعكس التحويل، وأن مجموع (بيد حاملين + بيد المدير + مصروف) = `totalTransferred`.
- سيناريو: تحويل يتجاوز الرصيد → رفض.

### 4) تنظيف بيانات (استفسار)
سنشغّل استعلام قراءة لفحص المشروع الحالي والتأكد من ظهور `cash_transfer` قائم على دفعة `draft` (إن وجد). إن ثبت، سنعرض عليك تحويل الدفعة يدوياً إلى `transferred` أو حذف التحويل — لن نغيّر بيانات دون موافقتك.

## القبول
- الكارت العلوي بعد الإصلاح: «بيد حاملي العُهد» = 7,955 بدل 2,955.
- شريط التوزيع يجمع 100% دون فقد.
- Vitest 91/91 + الاختبارات الجديدة تنجح.
- لا يمكن تحويل نقد من دفعة غير نشطة أو بمبلغ يتجاوز الرصيد (على مستوى الـ DB).
