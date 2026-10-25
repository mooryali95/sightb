-- ============================================================================
-- SightB · align Albania with the consolidated statement, stages 2 and 3 of 3
-- (one-off, CLAUDE.md rule 4 exception). Run stage 1 first.
--
-- Paste ALL of this into Lovable Cloud's SQL editor and run it once. Safe to
-- run again. The last statement returns ONE row: "✅ aligned" or what is not.
--
-- Stage 2, Manzouma's administrative expenses (4,611). Dr Saleh paid them
-- from his pocket (owner's answer, 25 October); Albania repaid him from its
-- fund. The six items were also recorded as Albania's own expenses, so they
-- counted twice. Now:
--   * the six become company expenses of منظومة الخبرة, paid by Dr Saleh, and
--     are charged in full to Albania marked «سدّده المشروع من مصروفه»: Albania's
--     page lists them, and its cost does not add them again;
--   * the six project rows are deleted (copied first, whole, into backup);
--   * Dr Saleh's 5,000 repayment splits as the statement does: 1,711 for
--     Manzouma's expenses and 3,289 for an older obligation, on the same fund.
-- Stage 3, Ahmed Sabri's advances of 20,000 and 3,000, paid from Omar's
-- custodies, are labelled as advances that became incentives.
--
-- Albania's direct spend goes from 203,744.16 to 199,133.16: the statement's
-- 190,933.16 plus the four expenses of 23 October (8,200).
-- Needs migration 20261026090000, applied below.
-- ============================================================================
BEGIN;

-- 20261026090000_charged_costs_settled_in_project
ALTER TABLE public.company_expense_allocations
  ADD COLUMN IF NOT EXISTS settled_in_project boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_expense_allocations.settled_in_project IS
  'The project already paid this share from its own spend; shown as charged, not added to its cost again.';

-- The project's team reads what was charged to it, now with the flag. The
-- return type changes, so the function is dropped and made again, still
-- asking for the second factor first.
DROP FUNCTION IF EXISTS public.project_charged_costs(uuid);
CREATE FUNCTION public.project_charged_costs(_project_id uuid)
RETURNS TABLE (allocation_id uuid, expense_id uuid, date date, kind text, description text, amount numeric,
               expense_amount numeric, settled_in_project boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Runs as its owner, past the second_factor policy on the tables it reads:
  -- it asks the database's rule itself, as every definer function a user may
  -- call does since 20260926120000.
  SELECT public.require_second_factor();
  SELECT a.id, e.id, e.date, e.kind, e.description, a.amount, e.amount, a.settled_in_project
    FROM company_expense_allocations a
    JOIN company_expenses e ON e.id = a.expense_id
   WHERE a.project_id = _project_id
     AND auth.uid() IS NOT NULL
     AND (has_access(auth.uid(), 'project'::scope_type, _project_id)
          OR has_access(auth.uid(), 'company'::scope_type, e.company_id))
   ORDER BY e.date DESC
$$;
REVOKE EXECUTE ON FUNCTION public.project_charged_costs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_charged_costs(uuid) TO authenticated;


INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261026090000', 'charged_costs_settled_in_project') ON CONFLICT (version) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS backup.expenses_20261026 (id uuid PRIMARY KEY, row jsonb NOT NULL, backed_up_at timestamptz NOT NULL DEFAULT now());
INSERT INTO backup.expenses_20261026 (id, row)
SELECT e.id, to_jsonb(e) FROM public.expenses e
 WHERE e.id IN ('f3e743ef-b7f1-4912-a535-7567fc5a8332', '6515b300-0b27-4084-a39a-764017a99a6e', '77859c6f-d5a0-454b-96d7-9f88a8c615f3', 'cfe6b4f9-045b-4e9e-bba2-bab47de2a910', '53d99002-dc3f-42b0-b786-c5b85177fc39', '628d1d3a-de68-4bc2-9ac5-0b4a9c04c8bd', '22b8ff66-ed2f-4ac6-a136-f3dc97b22b03', '01e01906-947c-4479-b85c-8c0abaa16da3',
                'daa98283-20ea-43c9-a284-ad74a13d4bf4', 'e17198c9-a59b-477f-b853-3a232585c1a2', '9f68d92c-dd53-48e0-a934-7a5baa8164ab')
ON CONFLICT (id) DO NOTHING;

-- Dr Saleh, a vendor of the company.
INSERT INTO public.parties (id, company_id, name, kind, user_id)
VALUES ('5a1e4000-0000-4000-8000-202610260001', '30eb7908-daa3-4497-83dc-c9150d3359d1', 'د صالح', 'vendor', 'e4144f09-c461-4af2-9fad-31440a8e9ac4') ON CONFLICT (id) DO NOTHING;

-- The six items, as the company's expenses paid by Dr Saleh (same ids as the rows they replace).
INSERT INTO public.company_expenses (id, company_id, date, amount, description, kind, paid_by_party_id, user_id) VALUES
  ('f3e743ef-b7f1-4912-a535-7567fc5a8332'::uuid, '30eb7908-daa3-4497-83dc-c9150d3359d1'::uuid, DATE '2026-07-22', 100, 'اعمال ادارية لمنظومة', 'other', '5a1e4000-0000-4000-8000-202610260001'::uuid, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid),
  ('6515b300-0b27-4084-a39a-764017a99a6e'::uuid, '30eb7908-daa3-4497-83dc-c9150d3359d1'::uuid, DATE '2026-07-22', 760, 'منظومة: جزء من فاتورة التأمينات', 'other', '5a1e4000-0000-4000-8000-202610260001'::uuid, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid),
  ('77859c6f-d5a0-454b-96d7-9f88a8c615f3'::uuid, '30eb7908-daa3-4497-83dc-c9150d3359d1'::uuid, DATE '2026-07-22', 800, 'مخالفة حماية الأجور + أتعاب', 'government', '5a1e4000-0000-4000-8000-202610260001'::uuid, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid),
  ('cfe6b4f9-045b-4e9e-bba2-bab47de2a910'::uuid, '30eb7908-daa3-4497-83dc-c9150d3359d1'::uuid, DATE '2026-08-04', 200, 'رسوم', 'government', '5a1e4000-0000-4000-8000-202610260001'::uuid, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid),
  ('53d99002-dc3f-42b0-b786-c5b85177fc39'::uuid, '30eb7908-daa3-4497-83dc-c9150d3359d1'::uuid, DATE '2026-08-06', 1351, 'التأمينات الاجتماعية', 'government', '5a1e4000-0000-4000-8000-202610260001'::uuid, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid),
  ('628d1d3a-de68-4bc2-9ac5-0b4a9c04c8bd'::uuid, '30eb7908-daa3-4497-83dc-c9150d3359d1'::uuid, DATE '2026-08-06', 1400, 'التأمينات الاجتماعية', 'government', '5a1e4000-0000-4000-8000-202610260001'::uuid, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Charged in full to Albania, already settled from Albania's spend.
-- The ledger's integrity trigger runs before ON CONFLICT is weighed, so an
-- existing allocation is skipped by NOT EXISTS, never by a conflict.
INSERT INTO public.company_expense_allocations (expense_id, project_id, amount, settled_in_project, user_id)
SELECT v.expense_id, v.project_id, v.amount, v.settled, v.user_id
  FROM (VALUES
  ('f3e743ef-b7f1-4912-a535-7567fc5a8332'::uuid, 'de74a099-0bf1-4237-8619-39352f38a704'::uuid, 100, true, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid),
  ('6515b300-0b27-4084-a39a-764017a99a6e'::uuid, 'de74a099-0bf1-4237-8619-39352f38a704'::uuid, 760, true, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid),
  ('77859c6f-d5a0-454b-96d7-9f88a8c615f3'::uuid, 'de74a099-0bf1-4237-8619-39352f38a704'::uuid, 800, true, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid),
  ('cfe6b4f9-045b-4e9e-bba2-bab47de2a910'::uuid, 'de74a099-0bf1-4237-8619-39352f38a704'::uuid, 200, true, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid),
  ('53d99002-dc3f-42b0-b786-c5b85177fc39'::uuid, 'de74a099-0bf1-4237-8619-39352f38a704'::uuid, 1351, true, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid),
  ('628d1d3a-de68-4bc2-9ac5-0b4a9c04c8bd'::uuid, 'de74a099-0bf1-4237-8619-39352f38a704'::uuid, 1400, true, 'e4144f09-c461-4af2-9fad-31440a8e9ac4'::uuid)) AS v(expense_id, project_id, amount, settled, user_id)
 WHERE NOT EXISTS (SELECT 1 FROM public.company_expense_allocations a
                    WHERE a.expense_id = v.expense_id AND a.project_id = v.project_id);
-- An allocation made earlier by hand is marked too. Only rows not yet marked
-- are touched: the ledger's integrity trigger re-adds a row's own amount on
-- update, so touching a marked row again would read as charging it twice.
UPDATE public.company_expense_allocations SET settled_in_project = true
 WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND NOT settled_in_project
   AND expense_id IN ('f3e743ef-b7f1-4912-a535-7567fc5a8332', '6515b300-0b27-4084-a39a-764017a99a6e', '77859c6f-d5a0-454b-96d7-9f88a8c615f3', 'cfe6b4f9-045b-4e9e-bba2-bab47de2a910', '53d99002-dc3f-42b0-b786-c5b85177fc39', '628d1d3a-de68-4bc2-9ac5-0b4a9c04c8bd');

-- No longer Albania's own expenses: the repayments to Dr Saleh are.
DELETE FROM public.expenses WHERE id IN ('f3e743ef-b7f1-4912-a535-7567fc5a8332', '6515b300-0b27-4084-a39a-764017a99a6e', '77859c6f-d5a0-454b-96d7-9f88a8c615f3', 'cfe6b4f9-045b-4e9e-bba2-bab47de2a910', '53d99002-dc3f-42b0-b786-c5b85177fc39', '628d1d3a-de68-4bc2-9ac5-0b4a9c04c8bd') AND project_id = 'de74a099-0bf1-4237-8619-39352f38a704';

-- Dr Saleh's repayments, named for what they paid.
UPDATE public.expenses SET description = 'سداد د صالح: مصروفات منظومة الإدارية المحمّلة على ألبانيا (تأمينات)'
 WHERE id IN ('01e01906-947c-4479-b85c-8c0abaa16da3', 'daa98283-20ea-43c9-a284-ad74a13d4bf4')
   AND description NOT LIKE 'سداد د صالح: مصروفات منظومة%';
UPDATE public.expenses SET amount = 1711, description = 'سداد د صالح: مصروفات منظومة الإدارية المحمّلة على ألبانيا (جزء من دفعة الملتقى)'
 WHERE id = '22b8ff66-ed2f-4ac6-a136-f3dc97b22b03' AND amount = 5000;
INSERT INTO public.expenses (id, user_id, project_id, category, description, amount, date, month, approval_status,
                             vendor, fund_id, is_vat_exempt, legacy_pre_fund, notes)
SELECT '32890000-0000-4000-8000-202610260001', e.user_id, e.project_id, e.category, 'سداد د صالح: التزام سابق (جزء من دفعة الملتقى)', 3289,
       e.date, e.month, e.approval_status, 'د صالح', e.fund_id, e.is_vat_exempt, e.legacy_pre_fund,
       'الجزء الثاني من سداد 5,000 لد صالح؛ الأول 1,711 لمصروفات منظومة'
  FROM public.expenses e WHERE e.id = '22b8ff66-ed2f-4ac6-a136-f3dc97b22b03'
ON CONFLICT (id) DO NOTHING;
UPDATE public.expenses SET vendor = 'بند مصروفات منظومة'
 WHERE id IN ('01e01906-947c-4479-b85c-8c0abaa16da3', 'daa98283-20ea-43c9-a284-ad74a13d4bf4', '22b8ff66-ed2f-4ac6-a136-f3dc97b22b03')
   AND vendor IS DISTINCT FROM 'بند مصروفات منظومة';

-- Stage 3: the advances that became incentives.
UPDATE public.expenses
   SET description = 'سلفة لأحمد صبري تحوّلت إلى حافز',
       notes = 'صُرفت سلفةً من عهدة عمر، ثم احتُسبت حافزاً لأحمد صبري (الكشف الموحّد، 25 أكتوبر)'
 WHERE id IN ('e17198c9-a59b-477f-b853-3a232585c1a2', '9f68d92c-dd53-48e0-a934-7a5baa8164ab')
   AND description <> 'سلفة لأحمد صبري تحوّلت إلى حافز';

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT CASE WHEN missing = '' THEN '✅ aligned — Albania 199,133.16 direct, 4,611 charged and settled, Saleh 1,711 + 3,289, two advances labelled'
  ELSE '❌ ' || missing END AS stages_2_and_3
FROM (
  SELECT concat_ws(', ',
    CASE WHEN (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND approval_status <> 'rejected') <> 199133.16
         THEN 'Albania direct spend is ' || (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND approval_status <> 'rejected') || ', 199133.16 expected' END,
    CASE WHEN (SELECT coalesce(sum(a.amount), 0) FROM public.company_expense_allocations a
               WHERE a.project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND a.settled_in_project AND a.expense_id IN ('f3e743ef-b7f1-4912-a535-7567fc5a8332', '6515b300-0b27-4084-a39a-764017a99a6e', '77859c6f-d5a0-454b-96d7-9f88a8c615f3', 'cfe6b4f9-045b-4e9e-bba2-bab47de2a910', '53d99002-dc3f-42b0-b786-c5b85177fc39', '628d1d3a-de68-4bc2-9ac5-0b4a9c04c8bd')) <> 4611
         THEN 'the 4,611 is not charged to Albania as settled' END,
    CASE WHEN (SELECT count(*) FROM public.company_expenses WHERE id IN ('f3e743ef-b7f1-4912-a535-7567fc5a8332', '6515b300-0b27-4084-a39a-764017a99a6e', '77859c6f-d5a0-454b-96d7-9f88a8c615f3', 'cfe6b4f9-045b-4e9e-bba2-bab47de2a910', '53d99002-dc3f-42b0-b786-c5b85177fc39', '628d1d3a-de68-4bc2-9ac5-0b4a9c04c8bd') AND paid_by_party_id = '5a1e4000-0000-4000-8000-202610260001') <> 6
         THEN 'the six company expenses are not all Dr Saleh''s' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.expenses WHERE id IN ('f3e743ef-b7f1-4912-a535-7567fc5a8332', '6515b300-0b27-4084-a39a-764017a99a6e', '77859c6f-d5a0-454b-96d7-9f88a8c615f3', 'cfe6b4f9-045b-4e9e-bba2-bab47de2a910', '53d99002-dc3f-42b0-b786-c5b85177fc39', '628d1d3a-de68-4bc2-9ac5-0b4a9c04c8bd')) THEN 'a project copy of the six remains' END,
    CASE WHEN (SELECT amount FROM public.expenses WHERE id = '22b8ff66-ed2f-4ac6-a136-f3dc97b22b03') <> 1711
           OR (SELECT amount FROM public.expenses WHERE id = '32890000-0000-4000-8000-202610260001') IS DISTINCT FROM 3289
         THEN 'Dr Saleh''s 5,000 is not split 1,711 + 3,289' END,
    CASE WHEN (SELECT count(*) FROM public.expenses WHERE description = 'سلفة لأحمد صبري تحوّلت إلى حافز') <> 2
         THEN 'the two advances are not labelled' END,
    CASE WHEN (SELECT count(*) FROM backup.expenses_20261026) <> 11 THEN 'backup holds ' || (SELECT count(*) FROM backup.expenses_20261026) || ' rows, 11 expected' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261026090000') THEN 'ledger row' END
  ) AS missing
) m;
