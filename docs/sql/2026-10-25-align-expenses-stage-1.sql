-- ============================================================================
-- SightB · align Albania and the hackathon with the consolidated statement,
-- stage 1 of 3 (one-off, CLAUDE.md rule 4 exception)
--
-- Paste ALL of this into Lovable Cloud's SQL editor and run it once. Safe to
-- run again. The last statement returns ONE row: "✅ aligned" or what is not.
--
-- What it changes, and nothing else:
--   1. The 10,000 incentive of 7 October recorded as «حافز شهر 6 عمر» is
--      Dr Ayman's: Omar has four incentives of 10,000 (40,000), Dr Ayman three.
--   2. «حافز عمر شهر 7» is dated 7 October, as in the statement.
--   3. Each expense the statement lists gets the statement's vendor (المورد),
--      so spend per person and per vendor reads as the statement does.
-- Totals do not change. Every row it touches is first copied, once, into
-- backup.expenses_20261025, which the API cannot reach: to undo, copy
-- description, date and vendor back from there.
--
-- Not here (stages 2 and 3, after the system can record them properly):
-- Manzouma's administrative expenses charged to Albania, Dr Saleh's 5,000
-- split, and Ahmed Sabri's advances taken as incentives.
-- ============================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS backup.expenses_20261025 (
  id uuid PRIMARY KEY, description text, date text, vendor text, backed_up_at timestamptz NOT NULL DEFAULT now()
);

CREATE TEMP TABLE statement_vendor (id uuid PRIMARY KEY, vendor text NOT NULL) ON COMMIT DROP;
INSERT INTO statement_vendor (id, vendor) VALUES
  ('01c5f8d1-1f49-4556-bea1-2a969f2063ed'::uuid, 'مصممون ومونتاج'),
  ('01e01906-947c-4479-b85c-8c0abaa16da3'::uuid, 'بند مصروفات منظومة'),
  ('07e23ff5-809d-47a3-b7c4-7fd81dcde6d8'::uuid, 'اشتراكات وتقنيات'),
  ('08a2973a-db1e-4369-93c3-f27f42eb03bb'::uuid, 'أحمد صبري (أبو رؤى)'),
  ('09d9ccd7-7ca0-4d8d-b559-0be8192a5590'::uuid, 'التذاكر والتأشيرات'),
  ('0ccd4b54-86a5-4a8b-9260-06ba15e35e92'::uuid, 'مصممون ومونتاج'),
  ('129f310b-40c6-428e-8e09-8bccae509fd3'::uuid, 'احتياطي مخاطر'),
  ('17eed770-5cef-4553-8fc6-5b439049c140'::uuid, 'عبدالله أصلان'),
  ('1a18cc49-f4b0-4fc5-8f1f-c68c7bc5a589'::uuid, 'التذاكر والتأشيرات'),
  ('21fa1278-4e74-41f8-9d18-ede09425f924'::uuid, 'قاعات وضيافة ألبانيا'),
  ('2860296d-1811-47e9-905a-a4cd3baa8512'::uuid, 'قاعات الهاكثون'),
  ('34c3d97d-5301-4d7b-b62d-03d9f0ee7c7d'::uuid, 'أحمد صبري (أبو رؤى)'),
  ('405f0518-6212-48c3-99c9-1c520d3e4bcc'::uuid, 'عمر عبدالحميد'),
  ('419b5c0d-1b22-48cc-98ed-c74912b7da1d'::uuid, 'مصممون ومونتاج'),
  ('4a0ca5fb-59a7-4f63-96b9-a964e0a1965a'::uuid, 'عمر عبدالحميد'),
  ('4a555a80-3bd9-4f9e-91c6-4a305de18be0'::uuid, 'المطبوعات'),
  ('50bf5b0d-e676-4222-8244-9d7173e76fff'::uuid, 'عمر عبدالحميد'),
  ('511a4265-d30e-4305-b88e-193a3676a4e7'::uuid, 'عبدالله أصلان'),
  ('574b57f8-a643-4b7a-ab66-86595dde7705'::uuid, 'التذاكر والتأشيرات'),
  ('584e93ff-8921-4c67-91ad-04cf9ee9fff7'::uuid, 'اشتراكات وتقنيات'),
  ('64cc569a-24e9-4e4d-a848-d43d365d5e9c'::uuid, 'قاعات الهاكثون'),
  ('679b48ee-0371-4c0a-84d8-4e2e5af13b46'::uuid, 'اشتراكات وتقنيات'),
  ('6ae623cd-b017-4bd8-a8c6-d2f9ae37a440'::uuid, 'اشتراكات وتقنيات'),
  ('6ec2db3c-d5ca-4703-822e-ffb43f3fb615'::uuid, 'أحمد صبري (أبو رؤى)'),
  ('6f9d06a4-ccdc-4500-9995-c508186fd2f0'::uuid, 'اشتراكات وتقنيات'),
  ('730e4449-3e5f-45f6-b659-ca8db5b0f705'::uuid, 'د أيمن أصلان'),
  ('75e6cbe9-c2c8-4798-8f8f-ae897726041f'::uuid, 'مصممون ومونتاج'),
  ('7a653309-d5e9-4851-9a61-a45367c6331a'::uuid, 'منصة الهاكثون'),
  ('7cdd1618-d3fe-4f68-9866-c39e4c382e69'::uuid, 'التذاكر والتأشيرات'),
  ('7d8592a7-21e8-4e94-a470-863775b5ace5'::uuid, 'عبدالله أصلان'),
  ('80ad4990-b773-44e4-ad5b-94c883fc1ed3'::uuid, 'عمر عبدالحميد'),
  ('84ac5bd0-d36d-4374-8ffd-e1293b971ab3'::uuid, 'التذاكر والتأشيرات'),
  ('8ca79a53-7053-4bd3-9893-e5ff30eb0ac4'::uuid, 'قاعات وضيافة ألبانيا'),
  ('8e7e4167-bf1a-4f3e-98d6-fd8b0931db30'::uuid, 'أحمد صبري (أبو رؤى)'),
  ('9068c87a-f8c8-492d-9e42-9916cf300211'::uuid, 'التذاكر والتأشيرات'),
  ('90d123dc-3499-4f88-8370-dea383fdd643'::uuid, 'عمر عبدالحميد'),
  ('920ef26f-5e09-4fa2-9df2-857a2a4ae843'::uuid, 'اشتراكات وتقنيات'),
  ('92f97779-9305-4a1d-a1cc-08cbbae0adaf'::uuid, 'التذاكر والتأشيرات'),
  ('9447325e-acb1-475f-b6ce-6d284d00673c'::uuid, 'د أيمن أصلان'),
  ('97afcf41-4952-4456-bca6-6ebe2d5b0e0a'::uuid, 'حفل واعي'),
  ('9f68d92c-dd53-48e0-a934-7a5baa8164ab'::uuid, 'أحمد صبري (أبو رؤى)'),
  ('9fc8ec4a-917f-4cdc-b892-208e77585eab'::uuid, 'التذاكر والتأشيرات'),
  ('b10b47fc-1377-4693-aa60-8cd8a5429511'::uuid, 'التذاكر والتأشيرات'),
  ('b3adc55e-bc85-428c-9706-6d3380851f43'::uuid, 'د أيمن أصلان'),
  ('b720b743-c117-4b8a-afd1-65a984cc501c'::uuid, 'جمعية المستقبل'),
  ('bb2843d8-8e3c-420e-9487-c7c5a0ea13db'::uuid, 'التذاكر والتأشيرات'),
  ('c3ea9400-95f7-4c67-8523-8df2fca3d266'::uuid, 'الضيافة'),
  ('c67cd43f-2f4f-43ab-b871-0349c86773ab'::uuid, 'عمر عبدالحميد'),
  ('c92ee8b5-a185-4e38-8e19-ac2a87ea31f7'::uuid, 'التذاكر والتأشيرات'),
  ('d0c3eb05-94f4-48ba-82fe-148117831cae'::uuid, 'د أيمن أصلان'),
  ('d17d0f9a-820d-45d5-a93c-c540004d1d6d'::uuid, 'يحيى الحميري'),
  ('d5efe80a-0545-4661-b3d1-4b1c56730878'::uuid, 'التصوير'),
  ('d7237436-5f0a-4131-974c-4856d1604148'::uuid, 'التذاكر والتأشيرات'),
  ('d8644bdb-27f6-410c-bc2f-8f1eb672133f'::uuid, 'د أيمن أصلان'),
  ('daa98283-20ea-43c9-a284-ad74a13d4bf4'::uuid, 'بند مصروفات منظومة'),
  ('e1184553-b31b-43e8-9687-63ec33fd048c'::uuid, 'مصممون ومونتاج'),
  ('e17198c9-a59b-477f-b853-3a232585c1a2'::uuid, 'أحمد صبري (أبو رؤى)'),
  ('e4db7b31-0cef-4cd9-9818-7ab6522364fa'::uuid, 'عمر عبدالحميد'),
  ('e636da3d-e193-42dc-a31c-e610f943b3f7'::uuid, 'يحيى الحميري'),
  ('ed795819-0494-4db7-985c-fbe03c87c5da'::uuid, 'يحيى الحميري'),
  ('f617f2e4-ae0e-45b5-b170-8c579fa3c640'::uuid, 'عبدالله أصلان'),
  ('fa327fe6-9736-427f-80ff-20ac24ebbbe5'::uuid, 'قاعات وضيافة ألبانيا'),
  ('ff09149b-ca0a-4990-b47b-61c06ea6a651'::uuid, 'التذاكر والتأشيرات');

INSERT INTO backup.expenses_20261025 (id, description, date, vendor)
SELECT e.id, e.description, e.date, e.vendor FROM public.expenses e
 WHERE e.id IN (SELECT id FROM statement_vendor)
ON CONFLICT (id) DO NOTHING;

-- 1. The incentive of 7 October is Dr Ayman's.
UPDATE public.expenses SET description = 'حافز د أيمن'
 WHERE id = 'b3adc55e-bc85-428c-9706-6d3380851f43' AND description <> 'حافز د أيمن';

-- 2. Omar's month-7 incentive is dated 7 October.
UPDATE public.expenses SET date = '2026-10-07'
 WHERE id = '50bf5b0d-e676-4222-8244-9d7173e76fff' AND date <> '2026-10-07';

-- 3. The statement's vendor on every row it lists.
UPDATE public.expenses e SET vendor = s.vendor
  FROM statement_vendor s
 WHERE e.id = s.id AND e.vendor IS DISTINCT FROM s.vendor;

COMMIT;

SELECT CASE WHEN missing = '' THEN '✅ aligned — Omar 4 × 10,000, Dr Ayman 3 × 10,000 in Albania, 63 vendors set, totals unchanged'
  ELSE '❌ ' || missing END AS stage_1
FROM (
  SELECT concat_ws(', ',
    CASE WHEN (SELECT count(*) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704'
               AND vendor = 'عمر عبدالحميد' AND category = 'salary' AND amount = 10000 AND approval_status <> 'rejected') <> 4
         THEN 'Omar does not have exactly four incentives' END,
    CASE WHEN (SELECT count(*) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704'
               AND vendor = 'د أيمن أصلان' AND category = 'salary' AND amount = 10000 AND approval_status <> 'rejected') <> 3
         THEN 'Dr Ayman does not have exactly three incentives' END,
    CASE WHEN (SELECT count(*) FROM public.expenses e JOIN backup.expenses_20261025 b USING (id)) <> 63
         THEN (SELECT count(*) FROM backup.expenses_20261025) || ' rows backed up, 63 expected' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.expenses e JOIN backup.expenses_20261025 b USING (id)
                      WHERE e.vendor IS NULL OR e.vendor = '') THEN 'a vendor left empty' END,
    CASE WHEN (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND approval_status <> 'rejected') NOT IN (203744.16, 199133.16, 201233.16)
         THEN 'Albania total is ' || (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND approval_status <> 'rejected') || ', 203744.16 expected (199133.16 after stage 2, 201233.16 after stage 4)' END,
    CASE WHEN (SELECT sum(amount) FROM public.expenses WHERE project_id = '88b5b124-d642-47a7-a6be-62d33f9cb1dc' AND approval_status <> 'rejected') <> 119566
         THEN 'hackathon total changed' END
  ) AS missing
) m;
