-- ============================================================================
-- SightB · close Albania (one-off, CLAUDE.md rule 4 exception).
--
-- Paste ALL of this into Lovable Cloud's SQL editor and run it once. Safe to
-- run again. The last statement returns ONE row: "✅ Albania closed" or what is not.
--
-- The owner, 27 October:
--   1. Dr Saleh's 10,000 was 1,400 + 1,500 + 1,711 + 3,289 paying back what he
--      put in (funds 4, 5 and 6, already recorded as his payables and closed
--      by those four rows) and 2,100 incentive. The 28 October block read
--      1,500 of the incentive as a loan repayment a second time: its four
--      loan movements go, and the incentive is 2,100 again.
--   2. Fund 4 was his money for the meeting, paid back to him.
--   3. What Albania's last cash went on: Dr Ayman's flight 2,200 and transport
--      500 (the 2,700 row), Mo'men 1,500, Dr Ayman's visa 200 (already in),
--      supervisors' rewards 3,750 (the row said 3,800), and not yet recorded:
--      housing and meals 2,500, visa 140 (33.13€), car 315 (75.76€), bag 210
--      (50€). Every custody and fund 7 pay what they still hold; the 1,059.16
--      no cash was left for, Omar paid himself: it stands as owed to him in
--      the project's payables until paid.
--   4. The three equal hall payments of 29 June are named as instalments 1 to 3.
-- Every custody of Albania ends at zero and closed. Every row changed or
-- removed is copied first into backup.
-- ============================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS backup.albania_close_20261027 (tbl text, id uuid, row jsonb NOT NULL, backed_up_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tbl, id));
INSERT INTO backup.albania_close_20261027 (tbl, id, row)
SELECT 'intercompany_entries', i.id, to_jsonb(i) FROM public.intercompany_entries i WHERE i.id IN ('15000000-0000-4000-8000-202610280001','15000000-0000-4000-8000-202610280002','15000000-0000-4000-8000-202610280003','15000000-0000-4000-8000-202610280004')
UNION ALL SELECT 'expenses', e.id, to_jsonb(e) FROM public.expenses e WHERE e.id IN ('fa327fe6-9736-427f-80ff-20ac24ebbbe5', '21fa1278-4e74-41f8-9d18-ede09425f924', '8ca79a53-7053-4bd3-9893-e5ff30eb0ac4', '21000000-0000-4000-8000-202610260001', '9c332cf7-60a4-465e-addd-64d6f27d84cf', 'a8f9a7a0-1507-4577-a55d-700f7491efbb')
UNION ALL SELECT 'project_funds', f.id, to_jsonb(f) FROM public.project_funds f WHERE f.id IN ('111aa257-db92-4bcc-be51-cefc488ce005', '6584d17f-8326-4e46-bee5-99be476e4b46')
UNION ALL SELECT 'custodies', c.id, to_jsonb(c) FROM public.custodies c WHERE c.project_id = 'de74a099-0bf1-4237-8619-39352f38a704'
ON CONFLICT DO NOTHING;

-- 1. Dr Saleh: the repayment counted twice goes; his incentive is 2,100.
UPDATE public.project_funds SET ledger_entry_id = NULL,
       notes = 'دفعة من مال د صالح لألبانيا، سُدّدت له ضمن دفعته 10,000 (1,500)'
 WHERE id = '6584d17f-8326-4e46-bee5-99be476e4b46' AND (ledger_entry_id IS NOT NULL OR notes IS DISTINCT FROM 'دفعة من مال د صالح لألبانيا، سُدّدت له ضمن دفعته 10,000 (1,500)');
DELETE FROM public.intercompany_entries WHERE id IN ('15000000-0000-4000-8000-202610280001','15000000-0000-4000-8000-202610280002','15000000-0000-4000-8000-202610280003','15000000-0000-4000-8000-202610280004');
UPDATE public.expenses
   SET amount = 2100, description = 'حافز د صالح (باقي دفعته 10,000)',
       notes = 'دفعة د صالح 10,000 = 1,400 + 1,500 + 1,711 + 3,289 رد ما دفعه (الدفعات 4 و5 و6) + 2,100 حافز (المالك، 27 أكتوبر)'
 WHERE id = '21000000-0000-4000-8000-202610260001' AND amount = 600;

-- 2. Fund 4.
UPDATE public.project_funds SET notes = 'دفعة من مال د صالح لملتقى المشروع، سُدّدت له ضمن دفعته 10,000 (1,711 + 3,289)'
 WHERE id = '111aa257-db92-4bcc-be51-cefc488ce005' AND notes IS DISTINCT FROM 'دفعة من مال د صالح لملتقى المشروع، سُدّدت له ضمن دفعته 10,000 (1,711 + 3,289)';

-- 3. The last cash, as the owner itemised it.
UPDATE public.expenses SET amount = 3750, description = 'مكافآت المشرفين' WHERE id = '9c332cf7-60a4-465e-addd-64d6f27d84cf' AND amount = 3800;
UPDATE public.expenses SET description = 'سفر د أيمن: طيران 2,200 ونقل وباص 500' WHERE id = 'a8f9a7a0-1507-4577-a55d-700f7491efbb' AND description = 'سفر د أيمن';
INSERT INTO public.expenses (id, user_id, project_id, category, description, amount, date, month, approval_status, approved_by,
                             is_vat_exempt, fund_id, custody_id, legacy_pre_fund, notes)
SELECT v.id, 'e4144f09-c461-4af2-9fad-31440a8e9ac4', 'de74a099-0bf1-4237-8619-39352f38a704', v.cat, v.d, v.a, DATE '2026-10-23', 4, 'approved', 'e4144f09-c461-4af2-9fad-31440a8e9ac4', true, v.fund, v.cust, false, v.note
  FROM (VALUES
    ('7a000000-0000-4000-8000-202610270001'::uuid, 'فيزا', 140::numeric, 'travel', NULL::uuid, 'afd4a9db-e310-4c80-9a83-b7adc7c28fa4'::uuid, 'بنود ألبانيا كما أوضحها المالك، 27 أكتوبر (33.13€)'),
    ('7a000000-0000-4000-8000-202610270002'::uuid, 'سيارة', 315::numeric, 'travel', NULL::uuid, 'afd4a9db-e310-4c80-9a83-b7adc7c28fa4'::uuid, 'بنود ألبانيا كما أوضحها المالك، 27 أكتوبر (75.76€)'),
    ('7a000000-0000-4000-8000-202610270003'::uuid, 'شنطة', 210::numeric, 'other', NULL::uuid, 'afd4a9db-e310-4c80-9a83-b7adc7c28fa4'::uuid, 'بنود ألبانيا كما أوضحها المالك، 27 أكتوبر (50€)'),
    ('7a000000-0000-4000-8000-202610270004'::uuid, 'سكن وإعاشة (من عهدة الدفعة النهائية)', 1185::numeric, 'hotel', NULL::uuid, 'afd4a9db-e310-4c80-9a83-b7adc7c28fa4'::uuid, 'بنود ألبانيا كما أوضحها المالك، 27 أكتوبر'),
    ('7a000000-0000-4000-8000-202610270005'::uuid, 'سكن وإعاشة (من باقي الدفعة 7)', 224::numeric, 'hotel', '0e20388d-f1f7-4601-ab5d-56afc477da33'::uuid, NULL::uuid, 'بنود ألبانيا كما أوضحها المالك، 27 أكتوبر'),
    ('7a000000-0000-4000-8000-202610270006'::uuid, 'سكن وإعاشة (من باقي عهدة عمر)', 22::numeric, 'hotel', NULL::uuid, 'a4d2317e-819a-435c-8ddb-8f80590479a7'::uuid, 'بنود ألبانيا كما أوضحها المالك، 27 أكتوبر'),
    ('7a000000-0000-4000-8000-202610270007'::uuid, 'سكن وإعاشة (من باقي عهدة عمر)', 2::numeric, 'hotel', NULL::uuid, '5da3138c-2075-4000-91f6-1ee32bf04468'::uuid, 'بنود ألبانيا كما أوضحها المالك، 27 أكتوبر'),
    ('7a000000-0000-4000-8000-202610270008'::uuid, 'سكن وإعاشة (من باقي عهدة التذاكر)', 7.84::numeric, 'hotel', NULL::uuid, '20e639b0-3a5a-4f85-ae92-2c77397b37a4'::uuid, 'بنود ألبانيا كما أوضحها المالك، 27 أكتوبر')
  ) AS v(id, d, a, cat, fund, cust, note)
 WHERE NOT EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = v.id);

-- What no cash was left for: Omar paid it himself, owed to him until paid.
INSERT INTO public.resource_reimbursements (id, project_id, resource_id, source_kind, category, description, amount, expense_date,
                                            receipt_attachments, notes, user_id, status, approved_by, approved_at)
SELECT '7b000000-0000-4000-8000-202610270001', 'de74a099-0bf1-4237-8619-39352f38a704', 'a7f1c8b9-aa2d-4d86-a640-95a99a7be74a', 'resource', 'hotel',
       'سكن وإعاشة ألبانيا: ما زاد عن العهد دفعه عمر من جيبه', 1059.16, DATE '2026-10-23', '[]'::jsonb,
       'سكن وإعاشة 2,500: دُفع 1,440.84 مما بقي في العهد والدفعة 7، والباقي من عمر (المالك، 27 أكتوبر)', 'e4144f09-c461-4af2-9fad-31440a8e9ac4', 'approved', 'e4144f09-c461-4af2-9fad-31440a8e9ac4', now()
 WHERE NOT EXISTS (SELECT 1 FROM public.resource_reimbursements WHERE id = '7b000000-0000-4000-8000-202610270001');

-- The three equal hall instalments of 29 June are three payments, not one entered thrice: say so.
UPDATE public.expenses SET description = 'دفعة القاعات ألبانيا: القسط ' || v.n || ' من 3'
  FROM (VALUES ('fa327fe6-9736-427f-80ff-20ac24ebbbe5'::uuid, '1'), ('21fa1278-4e74-41f8-9d18-ede09425f924'::uuid, '2'), ('8ca79a53-7053-4bd3-9893-e5ff30eb0ac4'::uuid, '3')) AS v(id, n)
 WHERE expenses.id = v.id AND expenses.description = 'جزء من دفعة القاعات ألبانيا';

-- Every custody of Albania is spent to zero: closed.
UPDATE public.custodies SET status = 'closed', closed_date = COALESCE(closed_date, '2026-10-27')
 WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND status <> 'closed';

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT CASE WHEN missing = '' THEN '✅ Albania closed — Dr Saleh 10,000 (7,900 back + 2,100 incentive), every custody at zero and closed, fund 7 spent, 1,059.16 owed to Omar, direct spend 203,289.00'
  ELSE '❌ ' || missing END AS albania
FROM (
  SELECT concat_ws(', ',
    CASE WHEN (SELECT count(DISTINCT description) FROM public.expenses WHERE id IN ('fa327fe6-9736-427f-80ff-20ac24ebbbe5', '21fa1278-4e74-41f8-9d18-ede09425f924', '8ca79a53-7053-4bd3-9893-e5ff30eb0ac4')) <> 3 THEN 'hall instalments not named' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.intercompany_entries WHERE id IN ('15000000-0000-4000-8000-202610280001','15000000-0000-4000-8000-202610280002','15000000-0000-4000-8000-202610280003','15000000-0000-4000-8000-202610280004')) THEN 'duplicate repayment still there' END,
    CASE WHEN (SELECT amount FROM public.expenses WHERE id = '21000000-0000-4000-8000-202610260001') <> 2100 THEN 'incentive is ' || (SELECT amount FROM public.expenses WHERE id = '21000000-0000-4000-8000-202610260001') END,
    CASE WHEN (COALESCE((SELECT sum(amount) FROM public.company_expenses WHERE paid_by_party_id = '5a1e4000-0000-4000-8000-202610260001'), 0)
   + COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE from_kind = 'party' AND from_id = '5a1e4000-0000-4000-8000-202610260001'), 0)
   - COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE to_kind = 'party' AND to_id = '5a1e4000-0000-4000-8000-202610260001'), 0)) <> 0 THEN 'Dr Saleh balance is ' || (COALESCE((SELECT sum(amount) FROM public.company_expenses WHERE paid_by_party_id = '5a1e4000-0000-4000-8000-202610260001'), 0)
   + COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE from_kind = 'party' AND from_id = '5a1e4000-0000-4000-8000-202610260001'), 0)
   - COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE to_kind = 'party' AND to_id = '5a1e4000-0000-4000-8000-202610260001'), 0)) END,
    CASE WHEN (SELECT count(*) FROM public.custodies c WHERE c.project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND (c.status <> 'closed'
   OR abs(c.amount + COALESCE((SELECT sum(amount) FROM public.cash_transfers WHERE to_custody_id = c.id), 0)
          - COALESCE((SELECT sum(amount) FROM public.expenses WHERE custody_id = c.id AND approval_status <> 'rejected'), 0)) > 0.005)) <> 0 THEN (SELECT count(*) FROM public.custodies c WHERE c.project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND (c.status <> 'closed'
   OR abs(c.amount + COALESCE((SELECT sum(amount) FROM public.cash_transfers WHERE to_custody_id = c.id), 0)
          - COALESCE((SELECT sum(amount) FROM public.expenses WHERE custody_id = c.id AND approval_status <> 'rejected'), 0)) > 0.005)) || ' custody not at zero or not closed' END,
    CASE WHEN (SELECT f.amount
        - COALESCE((SELECT sum(e.amount) FROM public.expenses e LEFT JOIN public.custodies cu ON cu.id = e.custody_id
                     WHERE e.fund_id = f.id AND e.approval_status <> 'rejected' AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> f.id)), 0)
        - COALESCE((SELECT sum(amount) FROM public.custodies WHERE source_fund_id = f.id), 0)
        - COALESCE((SELECT sum(amount) FROM public.cash_transfers WHERE from_fund_id = f.id), 0)
        - COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE source_fund_id = f.id), 0)
       FROM public.project_funds f WHERE f.id = '0e20388d-f1f7-4601-ab5d-56afc477da33') <> 0 THEN 'fund 7 still holds ' || (SELECT f.amount
        - COALESCE((SELECT sum(e.amount) FROM public.expenses e LEFT JOIN public.custodies cu ON cu.id = e.custody_id
                     WHERE e.fund_id = f.id AND e.approval_status <> 'rejected' AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> f.id)), 0)
        - COALESCE((SELECT sum(amount) FROM public.custodies WHERE source_fund_id = f.id), 0)
        - COALESCE((SELECT sum(amount) FROM public.cash_transfers WHERE from_fund_id = f.id), 0)
        - COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE source_fund_id = f.id), 0)
       FROM public.project_funds f WHERE f.id = '0e20388d-f1f7-4601-ab5d-56afc477da33') END,
    CASE WHEN (SELECT amount FROM public.resource_reimbursements WHERE id = '7b000000-0000-4000-8000-202610270001') IS DISTINCT FROM 1059.16 THEN 'owed to Omar missing' END,
    CASE WHEN (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND approval_status <> 'rejected') <> 203289.00 THEN 'Albania direct spend is ' || (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND approval_status <> 'rejected') || ', 203289.00 expected' END
  ) AS missing
) m;
