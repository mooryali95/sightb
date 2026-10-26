-- ============================================================================
-- SightB · Dr Saleh's 10,000 and Manzouma's design costs, stage 4
-- (one-off, CLAUDE.md rule 4 exception). Run stages 1 to 3 first.
--
-- Paste ALL of this into Lovable Cloud's SQL editor and run it once. Safe to
-- run again. The last statement returns ONE row: "✅ aligned" or what is not.
--
-- The owner, 26 October:
--   * Albania paid Dr Saleh 10,000: 4,611 for Manzouma's administrative
--     expenses, 3,289 for an older obligation of Manzouma's (also Manzouma's
--     expense, not Albania's own), and 2,100 as an incentive to him.
--     Fund 7 holds exactly 2,100 not yet spent: that incentive, never entered.
--   * Manzouma's identity design (300) and its designs and domain (360) move
--     to the company, marked as belonging to Albania.
-- So:
--   * the 3,289 becomes a company expense paid by Dr Saleh, charged to
--     Albania and settled from its spend, like the 4,611;
--   * the 300 and 360 become company expenses charged to Albania and settled
--     from its spend (Albania's custody paid them); their project rows say so;
--   * Dr Saleh's 2,100 incentive is entered on fund 7, dated 7 October.
-- Albania's direct spend goes from 199,133.16 to 201,233.16 (the 2,100);
-- nothing else moves. Every row touched is copied first into backup.
-- ============================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS backup.expenses_20261026b (id uuid PRIMARY KEY, row jsonb NOT NULL, backed_up_at timestamptz NOT NULL DEFAULT now());
INSERT INTO backup.expenses_20261026b (id, row)
SELECT e.id, to_jsonb(e) FROM public.expenses e
 WHERE e.id IN ('32890000-0000-4000-8000-202610260001', '0ccd4b54-86a5-4a8b-9260-06ba15e35e92', 'e1184553-b31b-43e8-9687-63ec33fd048c')
ON CONFLICT (id) DO NOTHING;

-- The company's side: the 3,289 paid by Dr Saleh, the 660 paid through Albania.
INSERT INTO public.company_expenses (id, company_id, date, amount, description, kind, paid_by_party_id, user_id) VALUES
  ('32890000-0000-4000-8000-202610260001', '30eb7908-daa3-4497-83dc-c9150d3359d1', DATE '2026-10-07', 3289,
   'التزام سابق لمنظومة لدى د صالح (سُدّد من ألبانيا ضمن دفعته 10,000)', 'other', '5a1e4000-0000-4000-8000-202610260001', 'e4144f09-c461-4af2-9fad-31440a8e9ac4'),
  ('0ccd4b54-86a5-4a8b-9260-06ba15e35e92', '30eb7908-daa3-4497-83dc-c9150d3359d1', DATE '2026-05-06', 300,
   'تصميم هوية منظومة (يخص ألبانيا، دُفع من عهدتها)', 'other', NULL, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'),
  ('e1184553-b31b-43e8-9687-63ec33fd048c', '30eb7908-daa3-4497-83dc-c9150d3359d1', DATE '2026-05-21', 360,
   'تصاميم ودومين منظومة (يخص ألبانيا، دُفع من عهدتها)', 'other', NULL, 'e4144f09-c461-4af2-9fad-31440a8e9ac4')
ON CONFLICT (id) DO NOTHING;

-- Charged to Albania, settled from its spend. NOT EXISTS, never ON CONFLICT:
-- the ledger's integrity trigger runs before a conflict is weighed.
INSERT INTO public.company_expense_allocations (expense_id, project_id, amount, settled_in_project, user_id)
SELECT v.expense_id, 'de74a099-0bf1-4237-8619-39352f38a704'::uuid, v.amount, true, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid
  FROM (VALUES ('32890000-0000-4000-8000-202610260001'::uuid, 3289::numeric),
               ('0ccd4b54-86a5-4a8b-9260-06ba15e35e92'::uuid, 300::numeric),
               ('e1184553-b31b-43e8-9687-63ec33fd048c'::uuid, 360::numeric)) AS v(expense_id, amount)
 WHERE NOT EXISTS (SELECT 1 FROM public.company_expense_allocations a
                    WHERE a.expense_id = v.expense_id AND a.project_id = 'de74a099-0bf1-4237-8619-39352f38a704');

-- The project rows stay (the cash left Albania), named for what they paid.
UPDATE public.expenses SET description = 'سداد د صالح: التزام سابق لمنظومة (محمّل على ألبانيا)', vendor = 'بند مصروفات منظومة'
 WHERE id = '32890000-0000-4000-8000-202610260001' AND description <> 'سداد د صالح: التزام سابق لمنظومة (محمّل على ألبانيا)';
UPDATE public.expenses SET description = 'منظومة (محمّل على ألبانيا): تصميم هوية منظومة'
 WHERE id = '0ccd4b54-86a5-4a8b-9260-06ba15e35e92' AND description <> 'منظومة (محمّل على ألبانيا): تصميم هوية منظومة';
UPDATE public.expenses SET description = 'منظومة (محمّل على ألبانيا): تصاميم ودومين منظومة'
 WHERE id = 'e1184553-b31b-43e8-9687-63ec33fd048c' AND description <> 'منظومة (محمّل على ألبانيا): تصاميم ودومين منظومة';

-- Dr Saleh's incentive, the rest of his 10,000, on fund 7.
INSERT INTO public.expenses (id, user_id, project_id, category, description, amount, date, month, approval_status,
                             vendor, fund_id, is_vat_exempt, legacy_pre_fund, notes)
SELECT '21000000-0000-4000-8000-202610260001', e.user_id, e.project_id, 'salary', 'حافز د صالح (باقي دفعته 10,000)', 2100,
       e.date, e.month, 'approved', 'د صالح', e.fund_id, true, false,
       'دفعة د صالح 10,000 = 4,611 مصروفات منظومة + 3,289 التزام سابق لمنظومة + 2,100 حافز (المالك، 26 أكتوبر)'
  FROM public.expenses e WHERE e.id = '22b8ff66-ed2f-4ac6-a136-f3dc97b22b03'
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT CASE WHEN missing = '' THEN '✅ aligned — Dr Saleh 10,000 (4,611 + 3,289 Manzouma, 2,100 incentive), 660 moved, Albania 201,233.16 direct'
  ELSE '❌ ' || missing END AS stage_4
FROM (
  SELECT concat_ws(', ',
    CASE WHEN (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND approval_status <> 'rejected') <> 201233.16
         THEN 'Albania direct spend is ' || (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND approval_status <> 'rejected') || ', 201233.16 expected' END,
    CASE WHEN (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704'
               AND ((vendor IN ('د صالح', 'بند مصروفات منظومة') AND description LIKE 'سداد د صالح%')
                    OR id = '21000000-0000-4000-8000-202610260001')) <> 10000
         THEN 'Albania''s payments to Dr Saleh do not come to 10,000' END,
    CASE WHEN (SELECT coalesce(sum(a.amount), 0) FROM public.company_expense_allocations a
               WHERE a.project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND a.settled_in_project) <> 8560
         THEN 'charged and settled on Albania is ' || (SELECT coalesce(sum(a.amount), 0) FROM public.company_expense_allocations a
               WHERE a.project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND a.settled_in_project) || ', 8560 expected (4,611 + 3,289 + 660)' END,
    CASE WHEN (SELECT f.amount - coalesce((SELECT sum(amount) FROM public.expenses x WHERE x.fund_id = f.id), 0)
                      - coalesce((SELECT sum(amount) FROM public.custodies c WHERE c.source_fund_id = f.id), 0)
                 FROM public.project_funds f WHERE f.id = '0e20388d-f1f7-4601-ab5d-56afc477da33') <> 0
         THEN 'fund 7 is not fully spent' END,
    CASE WHEN (SELECT count(*) FROM backup.expenses_20261026b) <> 3 THEN 'backup holds ' || (SELECT count(*) FROM backup.expenses_20261026b) || ' rows, 3 expected' END
  ) AS missing
) m;
