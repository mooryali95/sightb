## الهدف
تنفيذ البندين A + B من الخطة السابقة داخل نافذة "تسوية سلفة قائمة" في `ResourcePayablesSection.tsx` — بدون أي تغييرات على قاعدة البيانات.

---

## B) شريط التقدم التفاعلي

يُضاف أعلى الحقول داخل الحوار، أسفل بطاقة معلومات السلفة مباشرةً. ثلاثة مقاطع ملوّنة بترميز النظام الدلالي:

```
[████ تم سابقاً ████|░░ هذه العملية ░░|██ متبقي قائم ██]
   refundedAmount         settledAmount      remainder
   (muted/info)           (primary)          (warning)
```

- الحساب لحظي حسب قيم الإدخال (refundAmount / docAmount / settledAmount):
  - `previouslySettled = refundedAmount`
  - `thisOperation = (refundAmount || 0) + (docAmount || 0)` للمركّبة، أو `settledAmount` للمفردة، أو `amount - refundedAmount` لـ payroll/written_off.
  - `remainder = max(amount - previouslySettled - thisOperation, 0)`
- ثلاثة Segments باستخدام عناصر `<div>` بنسب width مئوية + Tooltip لكل مقطع يعرض المبلغ بصيغة `formatCurrency`.
- ملصقات أسفل الشريط: "مسوّى سابقاً" / "هذه العملية" / "المتبقي" + المبلغ.
- تحذير بصري (نص destructive) إذا تجاوز `thisOperation` المتبقي القائم.

## A) التسوية المركّبة (رد نقدي + توثيق في عملية واحدة)

تُضاف خيار خامس في `RadioGroup` الخاص بنوع التسوية:

> **تسوية مركّبة** — جزء يُرد نقداً للدفعة/العهدة، وجزء يُوثَّق كمصروف فعلي.

عند اختياره:
- يظهر حقلان للمبلغ: `المبلغ المردود نقداً` و `المبلغ الموثَّق كمصروف`.
- حقل `فئة المصروف` يظهر (نفس Select الحالي).
- التحقق: `refundAmount + docAmount > 0` وكلاهما ≤ المتبقي القائم.

التنفيذ في `handleSettleAdvance` (بدون تغيير API السلايس):
1. إن كان `refundAmount > 0`: `await settleAdvance(id, { type: 'cash_refund', settledAmount: refundAmount, notes })`.
2. إن كان `docAmount > 0`: `await settleAdvance(id, { type: 'documented', settledAmount: docAmount, expenseCategory, notes })`.
3. عرض toast واحد بنتيجة العملية المركّبة.
4. في حال فشل الخطوة الثانية بعد نجاح الأولى: toast تحذيري يوضح أن الرد تم لكن التوثيق فشل، مع إبقاء النافذة مفتوحة لإعادة المحاولة.

---

## تفاصيل تقنية

**State جديد داخل المكوّن:**
```ts
const [saRefundAmount, setSaRefundAmount] = useState('');
const [saDocAmount, setSaDocAmount] = useState('');
```

**شريط التقدم:** مكوّن صغير محلي `SettlementProgressBar` يستقبل `{ amount, previouslySettled, thisOperation }` ويعرض الـ 3 segments + الملصقات + التحذير. لا نستخدم `<Progress>` الجاهز لأنه يدعم قيمة واحدة فقط.

**التوكنز اللونية:**
- "مسوّى سابقاً": `bg-muted` / `text-muted-foreground`
- "هذه العملية": `bg-primary` / `text-primary`
- "المتبقي": استخدام helper `health-warning` المعتمد في المشروع (وفق memory الـ tokens) — أي `bg-warning` / `text-warning-foreground`.
- التحذير عند التجاوز: `text-destructive`.

**لا تغييرات في:**
- `resourcePayableSlice.ts` (نُعيد استخدام `settleAdvance` مرتين للمركّبة).
- الـ schema / RLS / triggers.
- ملفات الاختبارات (الـ 15 unit tests الحالية تغطّي كلا النوعَين بالفعل).

---

## الملفات المتأثرة

- `src/components/project/ResourcePayablesSection.tsx` — تعديل الحوار: إضافة `SettlementProgressBar`، خيار "مركّبة"، حقول الإدخال المزدوجة، تعديل `handleSettleAdvance`، توسيع `setSaType` ليشمل `'compound'`.

---

## القبول
- شريط التقدم يتحدّث فوراً مع كل تغيير في حقل المبلغ.
- اختيار "مركّبة" مع `refund=2000 + doc=1000` على سلفة 3000 يُغلقها بالكامل وينشئ سجل رد + مصروف موثَّق واحد.
- تجاوز المتبقي يُظهر تحذيراً ويُعطّل زر التنفيذ.
- لا أرقام عربية/هندية في الواجهة (وفق سياسة التوطين).
