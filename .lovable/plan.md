# خطة: إكمال المرحلة B + المرحلة 1 (تقليل الديون التقنية)

هدف مزدوج: (1) إغلاق دورة تسوية السلف كمصاريف مرتبطة بالمورد مع تكامل SSOT، (2) بدء تفكيك الملفات الضخمة وإضافة طبقة `services/` عازلة بين slices و Supabase — دون كسر السلوك الحالي.

---

## الجزء الأول — إكمال Phase B (Advance → Expense Settlement)

البنية التحتية جاهزة (RPC `split_settle_advance` + triggers). ما ينقص: واجهة المستخدم داخل تدفق طلب الصرف.

### 1.1 خدمة جديدة `src/services/advanceSettlementService.ts`
- `settleAdvance({ prId, mode: 'full' | 'partial' | 'split', ... })` تغلف نداءات RPC/Insert.
- Modes:
  - **full**: مصروف واحد بمبلغ السلفة الكامل (event `documented`).
  - **partial**: مصروف جزئي + إبقاء الباقي مفتوحاً.
  - **split**: يستدعي `split_settle_advance` عندما يتجاوز المصروف مبلغ السلفة (فائض من دفعة/عهدة أخرى).

### 1.2 مكوّن `AdvanceSettlementInspector.tsx`
- يفتح من `PaymentRequestsSection` أو من زر "تسوية" داخل قائمة السلف المفتوحة.
- InspectorPanel مع ثلاثة أوضاع + معاينة SSOT (المتبقي، أثر التسوية).

### 1.3 ربطه في `ExpensesSection`
- Dropdown "من سلفة مفتوحة" داخل نموذج المصروف يفتح Inspector السابق بدل السماح بإدخال حر.

---

## الجزء الثاني — طبقة `services/` (Week 1, تقليل الديون)

### 2.1 هيكل جديد
```text
src/services/
  supabaseClient.ts        # re-export موحّد (نقطة عزل)
  fundService.ts           # كل نداءات project_funds + cash_transfers
  custodyService.ts        # custodies + auto-close
  expenseService.ts        # expenses CRUD + validations
  paymentRequestService.ts # payment_requests + settlement_events
  resourcePayableService.ts# resource_reimbursements (resource + vendor)
  advanceSettlementService.ts
```
- كل service يُرجع Result موحد `{ data, error }` ويرمي أخطاء موصوفة بالعربي.
- Slices تستدعي services فقط — ممنوع استيراد `supabase` مباشرة في slices بعد الترحيل.

### 2.2 ترحيل تدريجي (بدون كسر)
- المرحلة الأولى: نقل جميع `.from('project_funds')` و `.from('cash_transfers')` من `fundSlice` و `cashTransferSlice` إلى `fundService`.
- المرحلة الثانية: `resourcePayableSlice.ts` (836 سطر) — نقل CRUD إلى `resourcePayableService.ts` + `advanceSettlementService.ts`، الإبقاء على الحالة/الاختيار في الـ slice فقط.
- Slices تصبح "state + orchestration" فقط.

---

## الجزء الثالث — تفكيك الملفات الكبيرة

### 3.1 `ProjectDetail.tsx` (955 سطر)
مقسّم إلى:
- `ProjectDetailHeader.tsx` (PageHeader + status menu + actions) — موجود جزئياً.
- `ProjectTabsConfig.ts` — قائمة التبويبات + الأيقونات + الصلاحيات في مكان واحد.
- `useProjectDetailData.ts` — hook يجمع كل selectors + realtime subscriptions.
- الملف الأصلي يبقى Shell (< 200 سطر) يركّب المكوّنات.

### 3.2 `resourcePayableSlice.ts` (836 سطر)
- استخراج الأنواع إلى `src/types/resourcePayables.ts`.
- استخراج helpers الحساب إلى `src/lib/resource-payables.ts` (موجود — نوسّعه).
- استخراج CRUD إلى `resourcePayableService.ts`.
- الـ slice يبقى ~200 سطر: state + actions تنسيقية.

### 3.3 `finance.ts` (760 سطر)
- تقسيم موضوعي:
  - `src/lib/finance/evm.ts` — PV/EV/AC/CPI/SPI/EAC/ETC.
  - `src/lib/finance/variance.ts` — CV/SV/VAC + تفسيرات.
  - `src/lib/finance/forecast.ts` — TCPI + توقعات.
  - `src/lib/finance/index.ts` — re-exports للتوافق العكسي (لا يكسر الاستيرادات القائمة).

---

## ضمانات الجودة
- كل ترحيل يصاحبه تشغيل `vitest run` — الاختبارات الحالية (`funds.test.ts`, `resource-payables.test.ts`, `evm`) يجب أن تبقى خضراء.
- إضافة اختبارات جديدة:
  - `advanceSettlementService.test.ts` (mock supabase) — full/partial/split.
  - `fundService.test.ts` — دلالة `effectiveAmount` بعد التحويل.
- لا تغييرات على schema أو RLS في هذه الخطة (البنية جاهزة).

---

## ترتيب التنفيذ (هذه الجلسة والتي تليها)
1. إنشاء هيكل `src/services/` + `fundService.ts` + `paymentRequestService.ts` + `advanceSettlementService.ts`.
2. `AdvanceSettlementInspector.tsx` + ربطه في PaymentRequests.
3. تقسيم `finance.ts` (الأسهل، بدون سلوك).
4. تفكيك `ProjectDetail.tsx` عبر hook + config.
5. تقليم `resourcePayableSlice.ts` عبر `resourcePayableService.ts`.

قل "ابدأ" لأنفذ الخطوات 1→5 بالتتابع، أو حدّد أي خطوة أولاً.