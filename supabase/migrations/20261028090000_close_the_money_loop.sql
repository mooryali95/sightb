-- ============================================================================
-- Close the money loop between the company and its projects.
--
--   * Cash left at a fund's settlement is carried, never lost: into the
--     project's next open fund (project_funds.carried_in, part of its amount),
--     or held as pending until the next fund arrives, or paid back to the
--     company when the project has finished (fund_settlements.carry_status).
--   * A repayment from a project to the company names the fund the cash left
--     (intercompany_entries.source_fund_id): the fund's balance counts it, so
--     a loan paid back is not booked as an expense.
--   * A fund created from company money points at its ledger movement
--     (project_funds.ledger_entry_id), so the two cannot drift apart.
--   * A settlement with a gap is never approved without a written reason.
-- Additive and idempotent.
-- ============================================================================

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
