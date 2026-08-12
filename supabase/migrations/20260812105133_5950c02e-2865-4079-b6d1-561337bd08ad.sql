-- 1) Canonical "fund spent" definition (matches src/lib/funds.ts)
CREATE OR REPLACE FUNCTION public.fund_total_spent(_fund_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT SUM(e.amount)
      FROM public.expenses e
      LEFT JOIN public.custodies cu ON cu.id = e.custody_id
      WHERE e.fund_id = _fund_id
        AND e.approval_status <> 'rejected'
        AND (cu.source_fund_id IS NULL OR cu.source_fund_id <> _fund_id)
    ), 0)
  + COALESCE((SELECT SUM(c.amount) FROM public.custodies c WHERE c.source_fund_id = _fund_id), 0)
  + COALESCE((
      SELECT SUM(GREATEST(p.amount - COALESCE(p.refunded_amount, 0), 0))
      FROM public.payment_requests p
      WHERE p.paid_from_fund_id = _fund_id
        AND p.request_type = 'advance'
        AND p.status = 'paid'
        AND p.is_advance_outstanding = true
    ), 0)
  + COALESCE((SELECT SUM(t.amount) FROM public.cash_transfers t WHERE t.from_fund_id = _fund_id), 0)
$$;

REVOKE EXECUTE ON FUNCTION public.fund_total_spent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fund_total_spent(uuid) TO authenticated, service_role;

-- 2) Recalc trigger now uses the canonical definition
CREATE OR REPLACE FUNCTION public.recalc_fund_settlement_spent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected uuid[];
  _f uuid;
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    _affected := ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.fund_id END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.fund_id END
    ];
  ELSIF TG_TABLE_NAME = 'custodies' THEN
    _affected := ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.source_fund_id END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.source_fund_id END
    ];
  ELSIF TG_TABLE_NAME = 'payment_requests' THEN
    _affected := ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.paid_from_fund_id END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.paid_from_fund_id END
    ];
  ELSIF TG_TABLE_NAME = 'cash_transfers' THEN
    _affected := ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.from_fund_id END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.from_fund_id END
    ];
  END IF;

  FOREACH _f IN ARRAY COALESCE(_affected, ARRAY[]::uuid[]) LOOP
    IF _f IS NOT NULL THEN
      UPDATE public.fund_settlements fs
      SET total_spent = public.fund_total_spent(_f),
          updated_at = now()
      WHERE fs.fund_id = _f;
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_settlement_spent_custodies ON public.custodies;
CREATE TRIGGER trg_recalc_settlement_spent_custodies
AFTER INSERT OR UPDATE OR DELETE ON public.custodies
FOR EACH ROW EXECUTE FUNCTION public.recalc_fund_settlement_spent();

DROP TRIGGER IF EXISTS trg_recalc_settlement_spent_prs ON public.payment_requests;
CREATE TRIGGER trg_recalc_settlement_spent_prs
AFTER INSERT OR UPDATE OR DELETE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.recalc_fund_settlement_spent();

DROP TRIGGER IF EXISTS trg_recalc_settlement_spent_transfers ON public.cash_transfers;
CREATE TRIGGER trg_recalc_settlement_spent_transfers
AFTER INSERT OR UPDATE OR DELETE ON public.cash_transfers
FOR EACH ROW EXECUTE FUNCTION public.recalc_fund_settlement_spent();

-- 3) Backfill existing settlements with the corrected figure
UPDATE public.fund_settlements fs
SET total_spent = public.fund_total_spent(fs.fund_id),
    updated_at = now();

-- 4) Protect cash transfers from losing their origin fund
CREATE OR REPLACE FUNCTION public.protect_fund_with_transfers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cash_transfers t WHERE t.from_fund_id = OLD.id) THEN
    RAISE EXCEPTION 'لا يمكن حذف الدفعة: توجد تحويلات نقدية صادرة منها. احذف التحويلات أولاً.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_fund_with_transfers ON public.project_funds;
CREATE TRIGGER trg_protect_fund_with_transfers
BEFORE DELETE ON public.project_funds
FOR EACH ROW EXECUTE FUNCTION public.protect_fund_with_transfers();

-- 5) Cash transfers must always point at an existing custody
DELETE FROM public.cash_transfers t
WHERE NOT EXISTS (SELECT 1 FROM public.custodies c WHERE c.id = t.to_custody_id);

ALTER TABLE public.cash_transfers
  DROP CONSTRAINT IF EXISTS cash_transfers_to_custody_id_fkey;
ALTER TABLE public.cash_transfers
  ADD CONSTRAINT cash_transfers_to_custody_id_fkey
  FOREIGN KEY (to_custody_id) REFERENCES public.custodies(id) ON DELETE CASCADE;