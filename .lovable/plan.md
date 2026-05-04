# خطة التنفيذ الكاملة: إصلاح المنظومة المالية + OCR للفواتير

سأنفّذ على **3 مراحل متتابعة في رسائل منفصلة** لضمان جودة المراجعة وعدم اكتظاظ التغييرات.

---

## 🟥 المرحلة 1 — MUST HAVE (P0 الإصلاحات الحرجة)

### M1 — فرض ربط المصروف بالدفعة على مستوى القاعدة

- **Trigger DB جديد** `enforce_expense_fund_link` على `expenses` (BEFORE INSERT/UPDATE):
  - إذا توجد دفعة `acknowledged` للمشروع و`fund_id IS NULL` → يرفع استثناء.
  - استثناء واحد: المصروفات المُنشأة من Trigger `auto_create_expense_on_payment` (نتعرّف عليها عبر `notes LIKE 'منشأ تلقائياً%'`).
  - **legacy bypass**: المصروفات الأقدم من تاريخ تفعيل أول دفعة في المشروع لا يُطبَّق عليها.

### M2 — منع تجاوز رصيد الدفعة/العهدة

- **Trigger DB** `check_fund_balance` على `expenses` (BEFORE INSERT/UPDATE):
  - إذا `fund_id` محدد → يحسب `SUM(expenses.amount WHERE fund_id=NEW.fund_id) + NEW.amount` ويرفض إن تجاوز `project_funds.amount`.
  - نفس المنطق لـ `custody_id` مقابل `custodies.amount`.
  - رسالة بالعربية واضحة.

### M3 — إصلاح البيانات التاريخية (Data Migration)

- **Migration نصي مع تعليق واضح**:
  ```sql
  -- مصروفات قديمة لمشاريع لم يكن بها دفعات وقت إنشائها → تُترك بدون fund_id (Legacy).
  -- إضافة عمود tag للوضوح:
  ALTER TABLE expenses ADD COLUMN IF NOT EXISTS legacy_pre_fund boolean DEFAULT false;
  UPDATE expenses e SET legacy_pre_fund = true
  WHERE fund_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM project_funds pf
      WHERE pf.project_id = e.project_id
        AND pf.transfer_date <= e.date::date
    );
  ```
- **لا أعدّل البيانات الفعلية**، فقط أسمها تاريخياً لاستثنائها من تنبيهات "غير مرتبطة".

### M4 — Trigger إغلاق تلقائي للعهد والدفعات

- **Trigger** `auto_close_custody_on_exhaustion` على `expenses` (AFTER INSERT/UPDATE/DELETE):
  - يعيد حساب `SUM(expenses.amount WHERE custody_id=X)` ويُحدّث `custodies.status='closed'` و`closed_date` إذا وصل ≥ amount.
- إزالة الـ `useEffect` من `CustodySection.tsx` (تنظيف).

### M5 — تحذير قوي على الفروقات في التسوية

- في `FundsSection.tsx`: عند `Math.abs(difference) > 1` → بطاقة AlertDialog حمراء كبيرة بدل Badge هادئ.
- إضافة عمود `الفرق` بألوان واضحة في جدول الدفعات.

### M6 — قفل تعديل `fund_id` بعد الإنشاء (للأدمن فقط)

- **Trigger DB** `protect_expense_fund_link` على `expenses` (BEFORE UPDATE):
  - إذا `OLD.fund_id IS NOT NULL` و`NEW.fund_id <> OLD.fund_id` و`NOT has_role(auth.uid(),'admin')` → يرفض.
- في الواجهة: تعطيل حقل `fund_id` في وضع التعديل لغير الأدمن.

---

## 🟧 المرحلة 2 — SHOULD HAVE (S1, S2, S3, S5, S6, S7, S8, S9)

> S4 (توحيد Fund + Custody) يحتاج هجرة كبيرة وقد يكسر سير عمل قائم — أؤجله ليُناقش لاحقاً.

### S1 — حدود الاعتماد المتدرّجة (Approval Thresholds)

- **جدول جديد** `approval_thresholds` (system-wide settings):
  - `min_amount`, `max_amount`, `required_role` ('editor' | 'admin' | 'owner'), `requires_attachment` boolean.
- **Defaults seeded**:
  - 0–1,000: editor، بدون مرفق
  - 1,000–10,000: editor + مرفق إلزامي
  - 10,000–50,000: admin
  - 50,000+: owner + مرفق إلزامي
- **Trigger** يفحص الحد المطلوب ويعيّن `approval_status='pending'` تلقائياً للمبالغ التي تحتاج اعتماد أعلى.
- **UI**: صفحة إعدادات في `/settings/approvals` (Admin فقط).

### S2 — Three-Way Match (Commitment ↔ Expense ↔ Receipt)

- إضافة `commitment_id` (FK اختياري) إلى `expenses`.
- في حقل ربط "بند الموازنة" بالمصروف، إضافة قسم "ربط بالتزام/عقد" مع dropdown يعرض الالتزامات النشطة لنفس البند.
- **Trigger** يُحدّث `commitments.spent_amount` تلقائياً من مجموع المصروفات المرتبطة (Single Source of Truth بدلاً من إدخال يدوي).
- لوحة في `CommitmentsSection`: "إجمالي / مصروف / متبقي" مع شريط تقدّم.

### S3 — Encumbrance Accounting

- في `BudgetSection.tsx`: حساب جديد `committed_amount` لكل `budget_item` = SUM commitments المرتبطة.
- `available = planned - spent - committed` (بدلاً من `planned - spent` فقط).
- تنبيه عند `committed > planned`.

### S5 — Cash Forecast (Burn Rate)

- في `FundsSection.tsx`: حساب معدّل الصرف اليومي لآخر 14 يوماً → التنبؤ بمتى ستنفد الدفعة.
- بطاقة جديدة: "متوقع نفاد الدفعة في: ١٢ يوم — يُنصح بطلب دفعة جديدة الآن".

### S6 — مرفقات إلزامية (مرتبط بـ S1)

- استخدام `resource-receipts` bucket الموجود + إنشاء `expense-receipts` bucket جديد.
- حقل `receipt_attachments jsonb` في `expenses`.
- في النموذج: زر رفع ملف (PDF/Image)، رفع لـ Storage، حفظ URL.
- Trigger يرفض المصروف بدون مرفق إذا كانت `approval_thresholds.requires_attachment = true`.

### S7 — Realtime Subscriptions

- إضافة `ALTER PUBLICATION supabase_realtime ADD TABLE expenses, project_funds, fund_settlements;`
- في `loadSlice.ts`: subscription على التغييرات لتحديث الـ store تلقائياً.

### S8 — تقرير الإغلاق المالي للمشروع (PDF)

- زر جديد في `ExecutiveSummary`: "تقرير الإغلاق المالي".
- يُنتج PDF (jsPDF موجود) يحتوي:
  - إجمالي محوّل / مصروف / مرتجع
  - حالة كل دفعة وتسوياتها
  - إجمالي مستحقات الموارد المتبقية
  - تحليل الانحرافات حسب الفئة
  - توقيع رقمي للأدمن.

### S9 — AI Anomaly Detection للمصروفات

- Edge Function جديد `expense-anomaly-detector`:
  - يستقبل المشروع، يجلب آخر 90 يوم من المصروفات.
  - يستخدم Lovable AI (`google/gemini-3-flash-preview`) مع tool calling لاستخراج JSON منظّم: `[{expense_id, anomaly_type, severity, reason}]`.
  - أنواع الشذوذ: تكرار، مبلغ خارج النمط، فئة غير معتادة للمسؤول، تكرار قريب.
- بطاقة في `ExecutiveSummary`: "تنبيهات ذكية للمصروفات".

---

## 🟦 المرحلة 3 — Mobile-First Expense Entry + OCR (C1)

### C1.1 — تجربة موبايل مُحسّنة

- صفحة جديدة `/m/expense/new` مُحسّنة للموبايل:
  - زر كاميرا كبير يفتح camera input مباشرة (`<input type="file" accept="image/*" capture="environment">`).
  - بعد الصورة: شاشة معاينة + زر "استخراج بالذكاء الاصطناعي".
  - نموذج مبسّط: المبلغ، التاريخ، الفئة، المشروع، المرفق — بحقول كبيرة.
  - زر "حفظ وإضافة آخر" + "حفظ وإغلاق".

### C1.2 — OCR للفواتير عبر Lovable AI Vision

- Edge Function جديد `extract-receipt-data`:
  - يستقبل: `{ image_base64, project_id }`.
  - يرفع الصورة لـ Storage (`expense-receipts/{user_id}/{timestamp}.jpg`).
  - يستدعي `google/gemini-2.5-pro` (multimodal) مع tool calling لاستخراج:
    ```json
    {
      "vendor_name": "string",
      "invoice_number": "string|null",
      "invoice_date": "YYYY-MM-DD|null",
      "total_amount": "number",
      "vat_amount": "number|null",
      "is_vat_inclusive": "boolean",
      "suggested_category": "ExpenseCategory enum",
      "line_items": [{ "description": "string", "amount": "number" }],
      "confidence": "0-1"
    }
    ```
  - يُرجع البيانات + `receipt_url`.
- الواجهة تملأ النموذج تلقائياً، ويراجع المستخدم ويعتمد.

### C1.3 — اختصار في الـ Sidebar

- زر عائم (FAB) في الموبايل لـ "تسجيل مصروف سريع".
- في الـ Desktop: زر في GlobalSearch (Ctrl+K) لـ "تسجيل مصروف بصورة".

---

## 📋 ملخص الملفات المتأثرة

### Migrations (3 ملفات)

1. `must_have_financial_integrity.sql` — M1, M2, M3, M4, M6 + tags
2. `should_have_governance.sql` — S1 (approval_thresholds), S2 (commitment_id+trigger), S3, S6 (storage bucket), S7 (realtime)
3. `c1_mobile_ocr.sql` — expense-receipts bucket + receipt_attachments column

### Edge Functions (2 جديد)

- `expense-anomaly-detector/index.ts` (S9)
- `extract-receipt-data/index.ts` (C1.2)

### Frontend

- **MUST**: تحديث `ExpensesSection.tsx`, `FundsSection.tsx`, `CustodySection.tsx`
- **SHOULD**: صفحة `pages/ApprovalSettings.tsx`, تحديث `CommitmentsSection.tsx`, `BudgetSection.tsx`, `loadSlice.ts`, مكون `CashForecastCard.tsx`, `ProjectClosureReport.tsx`
- **C1**: صفحة `pages/MobileExpenseCapture.tsx`, مكون `ReceiptScanner.tsx`, تحديث `AppLayout` للـ FAB

### Tests

- `funds-validation.test.ts` لاختبار قواعد الـ triggers (محاكاة)
- `approval-thresholds.test.ts`

---

## ⚠️ ملاحظات حوكمة مهمة

1. **سأنفّذ المرحلة 1 (MUST HAVE) كاملة في الرد التالي**، ثم أتوقف لتؤكد قبل المتابعة للمرحلة 2.
2. **لن أحذف أي بيانات** — كل التغييرات إضافية أو تحويل soft.
3. **Triggers جديدة قابلة للتعطيل** عبر `ALTER TABLE ... DISABLE TRIGGER` لو حدث طارئ.
4. **التوافق مع الأدوار**: Viewers لا يتأثرون (read-only)، Editors يحصلون على نفس الصلاحيات الحالية + قواعد أصرم، Admins فقط يستطيعون تعديل `fund_id` و حدود الاعتماد.
5. **VAT**: لن ألمس Net Storage Policy — كل المبالغ تبقى صافية.
6. **التكلفة**: OCR و Anomaly Detection سيستهلكان من رصيد Lovable AI (تنبيه واحد للمستخدم في أول استخدام).

هل أبدأ بالمرحلة 1 (MUST HAVE) فوراً؟  
نعم ثم اكمل Mobile-First Expense Entry + OCR (C1) فقط وتجاوز مرحلة الثانية الى ان نتناقش بها في رسالة جديدة

&nbsp;