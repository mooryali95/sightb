-- ============================================================================
-- SightB · close the money loop, and Albania's funds 4 to 7
-- (one-off, CLAUDE.md rule 4 exception).
--
-- Paste ALL of this into Lovable Cloud's SQL editor and run it once. Safe to
-- run again. The last statement returns ONE row: "✅ closed" or what is not.
-- Source: supabase/migrations/20261028090000_close_the_money_loop.sql
--
-- The system (from the migration):
--   * cash left at a settlement is carried into the project's next fund, or
--     waits for one, or goes back to the company once the project is done;
--   * a project's repayment to the company names the fund the cash left, so
--     a loan paid back is no longer booked as an expense;
--   * a fund the company sent is linked to its ledger movement;
--   * a settlement with a gap is never approved without its reason.
--
-- Albania, as the owner set it out on 26 October:
--   * fund 4 (5,000) came from the project's revenue. 1,565 was spent and
--     224 returned in hand; 3,211 has no record anywhere. The gap is written
--     on its settlement so it stays visible, and the 224 joins fund 7.
--   * fund 5 (1,400) was Dr Saleh's payment of Manzouma's social insurance,
--     already a company expense he paid himself. It never reached Albania:
--     the fund and its 1,400 transfer into the «منظومة» custody are removed.
--   * fund 6 (1,500) was Dr Saleh's money lent to Albania and spent on it.
--     It becomes a loan through the company, repaid to him from fund 7 as
--     part of his 10,000: of the 2,100 entered as his incentive, 1,500 was
--     that repayment and 600 the incentive.
--   * the 7,900 Manzouma owed him for bills he paid (4,611 + 3,289) was paid
--     by Albania within the same 10,000; the company's debt to him closes.
-- Albania's direct spend goes from 201,233.16 to 199,733.16 (the 1,500 that
-- was a repayment, not a cost). Every row changed or removed is copied first
-- into backup.
-- ============================================================================
BEGIN;

ALTER TABLE public.project_funds
  ADD COLUMN IF NOT EXISTS carried_in numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ledger_entry_id uuid REFERENCES public.intercompany_entries(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE public.project_funds ADD CONSTRAINT project_funds_carried_in_range CHECK (carried_in >= 0 AND carried_in <= amount);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.fund_settlements
  ADD COLUMN IF NOT EXISTS carry_status text,
  ADD COLUMN IF NOT EXISTS carried_to_fund_id uuid REFERENCES public.project_funds(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE public.fund_settlements ADD CONSTRAINT fund_settlements_carry_status_check
    CHECK (carry_status IS NULL OR carry_status IN ('pending', 'carried', 'returned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.intercompany_entries
  ADD COLUMN IF NOT EXISTS source_fund_id uuid REFERENCES public.project_funds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS intercompany_entries_source_fund_idx ON public.intercompany_entries (source_fund_id) WHERE source_fund_id IS NOT NULL;

-- An expense may not spend what the fund already paid back.
CREATE OR REPLACE FUNCTION public.check_fund_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _fund_total numeric;
  _fund_direct_spent numeric;
  _fund_custody_draw numeric;
  _fund_outstanding_advances numeric;
  _fund_cash_transfers_out numeric;
  _fund_returned numeric;
  _custody_total numeric;
  _custody_cash_in numeric;
  _custody_spent numeric;
  _custody_outstanding_advances numeric;
  _new_custody_source uuid;
  _self uuid := COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
BEGIN
  -- An advance's outstanding part is cash already counted as drawn. An
  -- expense that settles that advance (source_payment_request_id) converts
  -- it, so it must reduce the outstanding figure instead of being counted twice.
  IF NEW.fund_id IS NOT NULL THEN
    SELECT source_fund_id INTO _new_custody_source FROM public.custodies WHERE id = NEW.custody_id;
    IF _new_custody_source IS NOT NULL AND _new_custody_source = NEW.fund_id THEN
      NULL;
    ELSE
      SELECT amount INTO _fund_total FROM public.project_funds WHERE id = NEW.fund_id;
      IF _fund_total IS NOT NULL THEN
        SELECT COALESCE(SUM(e.amount),0) INTO _fund_direct_spent
        FROM public.expenses e
        LEFT JOIN public.custodies cu ON cu.id = e.custody_id
        WHERE e.fund_id = NEW.fund_id AND e.id <> _self
          AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> NEW.fund_id);
        SELECT COALESCE(SUM(amount),0) INTO _fund_custody_draw
        FROM public.custodies WHERE source_fund_id = NEW.fund_id;
        SELECT COALESCE(SUM(GREATEST(pr.amount - COALESCE(pr.refunded_amount,0)
            - COALESCE((SELECT SUM(x.amount) FROM public.expenses x
                        WHERE x.source_payment_request_id = pr.id AND x.id <> _self
                          AND x.fund_id = NEW.fund_id), 0)
            - CASE WHEN pr.id = NEW.source_payment_request_id THEN NEW.amount ELSE 0 END, 0)),0)
          INTO _fund_outstanding_advances
        FROM public.payment_requests pr
        WHERE pr.paid_from_fund_id = NEW.fund_id AND pr.request_type = 'advance'
          AND pr.status = 'paid' AND pr.is_advance_outstanding = true;
        SELECT COALESCE(SUM(amount),0) INTO _fund_cash_transfers_out
        FROM public.cash_transfers WHERE from_fund_id = NEW.fund_id;
        -- Cash the project paid back to the company out of this fund.
        SELECT COALESCE(SUM(amount),0) INTO _fund_returned
        FROM public.intercompany_entries WHERE source_fund_id = NEW.fund_id;
        IF (_fund_direct_spent + _fund_custody_draw + _fund_outstanding_advances + _fund_cash_transfers_out + _fund_returned + NEW.amount) > _fund_total THEN
          RAISE EXCEPTION 'المصروف يتجاوز الرصيد المتبقي للدفعة. المتاح: %, المطلوب: %',
            (_fund_total - _fund_direct_spent - _fund_custody_draw - _fund_outstanding_advances - _fund_cash_transfers_out - _fund_returned)::text, NEW.amount::text
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.custody_id IS NOT NULL THEN
    SELECT amount INTO _custody_total FROM public.custodies WHERE id = NEW.custody_id;
    IF _custody_total IS NOT NULL THEN
      SELECT COALESCE(SUM(amount),0) INTO _custody_cash_in
      FROM public.cash_transfers WHERE to_custody_id = NEW.custody_id;
      SELECT COALESCE(SUM(amount),0) INTO _custody_spent
      FROM public.expenses WHERE custody_id = NEW.custody_id AND id <> _self;
      SELECT COALESCE(SUM(GREATEST(pr.amount - COALESCE(pr.refunded_amount,0)
          - COALESCE((SELECT SUM(x.amount) FROM public.expenses x
                      WHERE x.source_payment_request_id = pr.id AND x.id <> _self
                        AND x.custody_id = NEW.custody_id), 0)
          - CASE WHEN pr.id = NEW.source_payment_request_id THEN NEW.amount ELSE 0 END, 0)),0)
        INTO _custody_outstanding_advances
      FROM public.payment_requests pr
      WHERE pr.paid_from_custody_id = NEW.custody_id AND pr.request_type = 'advance'
        AND pr.status = 'paid' AND pr.is_advance_outstanding = true;
      IF (_custody_spent + _custody_outstanding_advances + NEW.amount) > (_custody_total + _custody_cash_in) THEN
        RAISE EXCEPTION 'المصروف يتجاوز رصيد العهدة. المتاح: %, المطلوب: %',
          (_custody_total + _custody_cash_in - _custody_spent - _custody_outstanding_advances)::text, NEW.amount::text
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.check_fund_balance() FROM PUBLIC, anon, authenticated;

-- A repayment out of a fund: from that fund's project, within what it still holds.
CREATE OR REPLACE FUNCTION public.check_ledger_fund_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _fund public.project_funds%ROWTYPE;
  _left numeric;
BEGIN
  IF NEW.source_fund_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _fund FROM public.project_funds WHERE id = NEW.source_fund_id;
  IF NEW.from_kind <> 'project' OR NEW.from_id IS DISTINCT FROM _fund.project_id THEN
    RAISE EXCEPTION 'الدفعة لا تتبع المشروع الدافع' USING ERRCODE = '23514';
  END IF;
  SELECT _fund.amount
       - COALESCE((SELECT sum(e.amount) FROM public.expenses e LEFT JOIN public.custodies cu ON cu.id = e.custody_id
                    WHERE e.fund_id = _fund.id AND e.approval_status <> 'rejected'
                      AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> _fund.id)), 0)
       - COALESCE((SELECT sum(amount) FROM public.custodies WHERE source_fund_id = _fund.id), 0)
       - COALESCE((SELECT sum(amount) FROM public.cash_transfers WHERE from_fund_id = _fund.id), 0)
       - COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE source_fund_id = _fund.id AND id <> NEW.id), 0)
    INTO _left;
  IF NEW.amount > _left + 0.005 THEN
    RAISE EXCEPTION 'المبلغ يتجاوز ما بقي في الدفعة رقم % (المتاح: %)', _fund.fund_number, round(_left, 2) USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_ledger_fund_source() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS intercompany_entries_fund_source ON public.intercompany_entries;
CREATE TRIGGER intercompany_entries_fund_source BEFORE INSERT OR UPDATE OF source_fund_id, amount ON public.intercompany_entries
  FOR EACH ROW EXECUTE FUNCTION public.check_ledger_fund_source();

-- A gap between received, spent and returned cash is approved only with its reason.
CREATE OR REPLACE FUNCTION public.check_settlement_gap_reason()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
     -- difference is a generated column, not computed yet in a BEFORE trigger.
     AND abs(COALESCE(NEW.total_received, 0) - COALESCE(NEW.total_spent, 0) - COALESCE(NEW.remaining_cash, 0)) > 1
     AND COALESCE(btrim(NEW.difference_reason), '') = '' THEN
    RAISE EXCEPTION 'لا يُعتمد فرق % دون سبب مكتوب',
      COALESCE(NEW.total_received, 0) - COALESCE(NEW.total_spent, 0) - COALESCE(NEW.remaining_cash, 0) USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_settlement_gap_reason() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS fund_settlements_gap_reason ON public.fund_settlements;
CREATE TRIGGER fund_settlements_gap_reason BEFORE UPDATE OF status ON public.fund_settlements
  FOR EACH ROW EXECUTE FUNCTION public.check_settlement_gap_reason();

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261028090000', 'close_the_money_loop') ON CONFLICT (version) DO NOTHING;

-- ── Albania ─────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS backup.money_loop_20261028 (tbl text, id uuid, row jsonb NOT NULL, backed_up_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tbl, id));
INSERT INTO backup.money_loop_20261028 (tbl, id, row)
SELECT 'project_funds', f.id, to_jsonb(f) FROM public.project_funds f WHERE f.id IN ('111aa257-db92-4bcc-be51-cefc488ce005', '57adfc62-4415-4998-b16b-ca2b31f8e325', '6584d17f-8326-4e46-bee5-99be476e4b46', '0e20388d-f1f7-4601-ab5d-56afc477da33')
UNION ALL SELECT 'fund_settlements', s.id, to_jsonb(s) FROM public.fund_settlements s WHERE s.fund_id IN ('111aa257-db92-4bcc-be51-cefc488ce005', '57adfc62-4415-4998-b16b-ca2b31f8e325', '0e20388d-f1f7-4601-ab5d-56afc477da33')
UNION ALL SELECT 'cash_transfers', t.id, to_jsonb(t) FROM public.cash_transfers t WHERE t.id = '9b81d0cb-5b45-44d8-8c57-e00a926fb5d1'
UNION ALL SELECT 'expenses', e.id, to_jsonb(e) FROM public.expenses e WHERE e.id = '21000000-0000-4000-8000-202610260001'
ON CONFLICT DO NOTHING;

-- Fund 5 never reached Albania.
DELETE FROM public.cash_transfers WHERE id = '9b81d0cb-5b45-44d8-8c57-e00a926fb5d1';
DELETE FROM public.project_funds WHERE id = '57adfc62-4415-4998-b16b-ca2b31f8e325';

-- Fund 4: what it was, and the gap nobody explained.
UPDATE public.project_funds SET notes = 'دفعة من إيراد المشروع لملتقى المشروع'
 WHERE id = '111aa257-db92-4bcc-be51-cefc488ce005' AND notes IS DISTINCT FROM 'دفعة من إيراد المشروع لملتقى المشروع';
UPDATE public.fund_settlements
   SET difference_reason = '3,211 غير موثّقة: لا مصروف ولا إعادة مسجّلة (مراجعة 26 أكتوبر). تحتاج متابعة مع مستلم الدفعة.'
 WHERE id = '466d8200-47c1-47b8-8e0d-21ca2d022db3' AND COALESCE(btrim(difference_reason), '') = '';

-- Fund 4's 224 in hand joins fund 7, whose open settlement expects it.
UPDATE public.project_funds SET amount = amount + 224, carried_in = 224 WHERE id = '0e20388d-f1f7-4601-ab5d-56afc477da33' AND carried_in = 0;
UPDATE public.fund_settlements SET carry_status = 'carried', carried_to_fund_id = '0e20388d-f1f7-4601-ab5d-56afc477da33' WHERE id = '466d8200-47c1-47b8-8e0d-21ca2d022db3' AND carry_status IS NULL;
UPDATE public.fund_settlements SET total_received = (SELECT amount FROM public.project_funds WHERE id = '0e20388d-f1f7-4601-ab5d-56afc477da33')
 WHERE fund_id = '0e20388d-f1f7-4601-ab5d-56afc477da33' AND status <> 'approved';

-- Dr Saleh's 10,000: 600 of the 2,100 was his incentive.
UPDATE public.expenses
   SET amount = 600, description = 'حافز د صالح (باقي دفعته 10,000)',
       notes = 'دفعة د صالح 10,000 = 4,611 مصروفات منظومة + 3,289 التزام سابق لمنظومة + 1,500 رد قرضه لألبانيا + 600 حافز (المالك، 26 أكتوبر)'
 WHERE id = '21000000-0000-4000-8000-202610260001' AND amount = 2100;

-- His 1,500 as a loan through the company, and its repayment; then the 7,900.
-- NOT EXISTS, never ON CONFLICT: the ledger's check runs before a conflict is weighed.
INSERT INTO public.intercompany_entries (id, company_id, date, amount, type, from_kind, from_id, to_kind, to_id, note, user_id, source_fund_id)
SELECT v.id, '30eb7908-daa3-4497-83dc-c9150d3359d1', v.date, v.amount, v.type, v.fk, v.fi, v.tk, v.ti, v.note, 'e4144f09-c461-4af2-9fad-31440a8e9ac4', v.src
  FROM (VALUES
    ('15000000-0000-4000-8000-202610280001'::uuid, DATE '2026-08-06', 1500::numeric, 'advance', 'party', '5a1e4000-0000-4000-8000-202610260001'::uuid, 'company', NULL::uuid, 'قرض لتمويل ألبانيا', NULL::uuid),
    ('15000000-0000-4000-8000-202610280002'::uuid, DATE '2026-08-06', 1500::numeric, 'advance', 'company', NULL::uuid, 'project', 'de74a099-0bf1-4237-8619-39352f38a704'::uuid, 'تمويل من قرض د صالح', NULL::uuid),
    ('15000000-0000-4000-8000-202610280003'::uuid, DATE '2026-10-07', 1500::numeric, 'repayment', 'project', 'de74a099-0bf1-4237-8619-39352f38a704'::uuid, 'company', NULL::uuid, 'رد تمويل قرض د صالح (من دفعته 10,000)', '0e20388d-f1f7-4601-ab5d-56afc477da33'::uuid),
    ('15000000-0000-4000-8000-202610280004'::uuid, DATE '2026-10-07', 1500::numeric, 'repayment', 'company', NULL::uuid, 'party', '5a1e4000-0000-4000-8000-202610260001'::uuid, 'رد قرضه (من دفعته 10,000)', NULL::uuid),
    ('79000000-0000-4000-8000-202610280005'::uuid, DATE '2026-10-07', 7900::numeric, 'repayment', 'company', NULL::uuid, 'party', '5a1e4000-0000-4000-8000-202610260001'::uuid, 'سداد ما دفعه عن المنظومة (4,611 + 3,289)، دفعته ألبانيا ضمن دفعته 10,000', NULL::uuid)
  ) AS v(id, date, amount, type, fk, fi, tk, ti, note, src)
 WHERE NOT EXISTS (SELECT 1 FROM public.intercompany_entries x WHERE x.id = v.id);
UPDATE public.project_funds SET ledger_entry_id = '15000000-0000-4000-8000-202610280002',
       notes = 'قرض من د صالح لألبانيا عبر المنظومة (رُدّ له ضمن دفعته 10,000)'
 WHERE id = '6584d17f-8326-4e46-bee5-99be476e4b46' AND ledger_entry_id IS NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT CASE WHEN missing = '' THEN '✅ closed — carry, repayments from funds, fund links, gap reasons; Albania: fund 5 removed, 224 carried to fund 7, Dr Saleh settled, direct spend 199,733.16'
  ELSE '❌ ' || missing END AS money_loop
FROM (
  SELECT concat_ws(', ',
    CASE WHEN NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261028090000') THEN 'ledger row' END,
    CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
               AND (table_name, column_name) IN (('project_funds', 'carried_in'), ('project_funds', 'ledger_entry_id'),
                    ('fund_settlements', 'carry_status'), ('fund_settlements', 'carried_to_fund_id'), ('intercompany_entries', 'source_fund_id'))) <> 5
         THEN 'new columns' END,
    CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgname IN ('intercompany_entries_fund_source', 'fund_settlements_gap_reason')) <> 2 THEN 'checks' END,
    CASE WHEN has_function_privilege('authenticated', 'public.check_ledger_fund_source()', 'EXECUTE') THEN 'check callable by users' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.project_funds WHERE id = '57adfc62-4415-4998-b16b-ca2b31f8e325') THEN 'fund 5 still there' END,
    CASE WHEN (SELECT c.amount + COALESCE((SELECT sum(amount) FROM public.cash_transfers WHERE to_custody_id = c.id), 0)
                      - COALESCE((SELECT sum(amount) FROM public.expenses WHERE custody_id = c.id AND approval_status <> 'rejected'), 0)
                 FROM public.custodies c WHERE c.id = 'a8efc157-29ef-40d0-a0c0-0dcbb8b9ef43') <> 0 THEN 'custody «منظومة» not balanced' END,
    CASE WHEN (SELECT carry_status FROM public.fund_settlements WHERE id = '466d8200-47c1-47b8-8e0d-21ca2d022db3') IS DISTINCT FROM 'carried' THEN 'fund 4''s 224 not carried' END,
    CASE WHEN COALESCE(btrim((SELECT difference_reason FROM public.fund_settlements WHERE id = '466d8200-47c1-47b8-8e0d-21ca2d022db3')), '') = '' THEN 'fund 4 gap reason' END,
    CASE WHEN (SELECT amount FROM public.project_funds WHERE id = '0e20388d-f1f7-4601-ab5d-56afc477da33') <> 60224 THEN 'fund 7 amount is ' || (SELECT amount FROM public.project_funds WHERE id = '0e20388d-f1f7-4601-ab5d-56afc477da33') || ', 60224 expected' END,
    CASE WHEN (SELECT f.amount
        - COALESCE((SELECT sum(e.amount) FROM public.expenses e LEFT JOIN public.custodies cu ON cu.id = e.custody_id
                     WHERE e.fund_id = f.id AND e.approval_status <> 'rejected' AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> f.id)), 0)
        - COALESCE((SELECT sum(amount) FROM public.custodies WHERE source_fund_id = f.id), 0)
        - COALESCE((SELECT sum(amount) FROM public.cash_transfers WHERE from_fund_id = f.id), 0)
        - COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE source_fund_id = f.id), 0)
       FROM public.project_funds f WHERE f.id = '0e20388d-f1f7-4601-ab5d-56afc477da33') <> 224 THEN 'fund 7 holds ' || (SELECT f.amount
        - COALESCE((SELECT sum(e.amount) FROM public.expenses e LEFT JOIN public.custodies cu ON cu.id = e.custody_id
                     WHERE e.fund_id = f.id AND e.approval_status <> 'rejected' AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> f.id)), 0)
        - COALESCE((SELECT sum(amount) FROM public.custodies WHERE source_fund_id = f.id), 0)
        - COALESCE((SELECT sum(amount) FROM public.cash_transfers WHERE from_fund_id = f.id), 0)
        - COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE source_fund_id = f.id), 0)
       FROM public.project_funds f WHERE f.id = '0e20388d-f1f7-4601-ab5d-56afc477da33') || ', 224 expected' END,
    CASE WHEN (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND approval_status <> 'rejected') <> 199733.16 THEN 'Albania direct spend is ' || (SELECT sum(amount) FROM public.expenses WHERE project_id = 'de74a099-0bf1-4237-8619-39352f38a704' AND approval_status <> 'rejected') || ', 199733.16 expected' END,
    CASE WHEN (COALESCE((SELECT sum(amount) FROM public.company_expenses WHERE paid_by_party_id = '5a1e4000-0000-4000-8000-202610260001'), 0)
   + COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE from_kind = 'party' AND from_id = '5a1e4000-0000-4000-8000-202610260001' AND to_kind = 'company'), 0)
   - COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE to_kind = 'party' AND to_id = '5a1e4000-0000-4000-8000-202610260001' AND from_kind = 'company'), 0)) <> 0 THEN 'company still owes Dr Saleh ' || (COALESCE((SELECT sum(amount) FROM public.company_expenses WHERE paid_by_party_id = '5a1e4000-0000-4000-8000-202610260001'), 0)
   + COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE from_kind = 'party' AND from_id = '5a1e4000-0000-4000-8000-202610260001' AND to_kind = 'company'), 0)
   - COALESCE((SELECT sum(amount) FROM public.intercompany_entries WHERE to_kind = 'party' AND to_id = '5a1e4000-0000-4000-8000-202610260001' AND from_kind = 'company'), 0)) END,
    CASE WHEN (SELECT ledger_entry_id FROM public.project_funds WHERE id = '6584d17f-8326-4e46-bee5-99be476e4b46') IS DISTINCT FROM '15000000-0000-4000-8000-202610280002'::uuid THEN 'fund 6 not linked' END,
    CASE WHEN (SELECT count(*) FROM backup.money_loop_20261028) < 8 THEN 'backup holds ' || (SELECT count(*) FROM backup.money_loop_20261028) || ' rows, 8 expected' END
  ) AS missing
) m;
