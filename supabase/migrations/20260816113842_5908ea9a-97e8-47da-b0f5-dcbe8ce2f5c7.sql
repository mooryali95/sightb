CREATE TABLE public.cash_transfer_repairs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  transfer_id uuid NOT NULL,
  custody_id uuid,
  custody_name text,
  amount numeric NOT NULL,
  transfer_date date,
  missing_fund_id uuid,
  reason text NOT NULL,
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid NOT NULL,
  performed_by_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cash_transfer_repairs TO authenticated;
GRANT ALL ON public.cash_transfer_repairs TO service_role;

ALTER TABLE public.cash_transfer_repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "repairs_select_scoped" ON public.cash_transfer_repairs
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_access(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "repairs_no_insert" ON public.cash_transfer_repairs
AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "repairs_no_update" ON public.cash_transfer_repairs
AS RESTRICTIVE FOR UPDATE TO authenticated USING (false);

CREATE POLICY "repairs_no_delete" ON public.cash_transfer_repairs
AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE INDEX idx_cash_transfer_repairs_project ON public.cash_transfer_repairs(project_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.custody_snapshot(_custody_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'custody_id', c.id,
    'base_amount', c.amount,
    'transfers_in', COALESCE((SELECT SUM(t.amount) FROM public.cash_transfers t WHERE t.to_custody_id = c.id), 0),
    'available', c.amount + COALESCE((SELECT SUM(t.amount) FROM public.cash_transfers t WHERE t.to_custody_id = c.id), 0),
    'spent', COALESCE((SELECT SUM(e.amount) FROM public.expenses e WHERE e.custody_id = c.id AND e.approval_status <> 'rejected'), 0),
    'outstanding_advances', COALESCE((
      SELECT SUM(GREATEST(p.amount - COALESCE(p.refunded_amount, 0), 0))
      FROM public.payment_requests p
      WHERE p.paid_from_custody_id = c.id AND p.request_type = 'advance'
        AND p.status = 'paid' AND p.is_advance_outstanding = true), 0),
    'remaining',
      c.amount
      + COALESCE((SELECT SUM(t.amount) FROM public.cash_transfers t WHERE t.to_custody_id = c.id), 0)
      - COALESCE((SELECT SUM(e.amount) FROM public.expenses e WHERE e.custody_id = c.id AND e.approval_status <> 'rejected'), 0)
      - COALESCE((
          SELECT SUM(GREATEST(p.amount - COALESCE(p.refunded_amount, 0), 0))
          FROM public.payment_requests p
          WHERE p.paid_from_custody_id = c.id AND p.request_type = 'advance'
            AND p.status = 'paid' AND p.is_advance_outstanding = true), 0)
  )
  FROM public.custodies c WHERE c.id = _custody_id;
$$;

REVOKE EXECUTE ON FUNCTION public.custody_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.custody_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.repair_orphan_cash_transfer(_transfer_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t public.cash_transfers%ROWTYPE;
  _custody_name text;
  _before jsonb;
  _after jsonb;
  _email text;
  _row_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'سبب الإصلاح مطلوب.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _t FROM public.cash_transfers WHERE id = _transfer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'التحويل غير موجود.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.can_edit(auth.uid(), 'project'::scope_type, _t.project_id) THEN
    RAISE EXCEPTION 'insufficient_permission' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.project_funds f WHERE f.id = _t.from_fund_id) THEN
    RAISE EXCEPTION 'هذا التحويل له دفعة أصل — لا يجوز إصلاحه كتحويل يتيم.' USING ERRCODE = 'P0001';
  END IF;

  SELECT resource_name INTO _custody_name FROM public.custodies WHERE id = _t.to_custody_id;
  _before := jsonb_build_object(
    'transfer', to_jsonb(_t),
    'custody', public.custody_snapshot(_t.to_custody_id)
  );

  DELETE FROM public.cash_transfers WHERE id = _transfer_id;

  _after := jsonb_build_object('custody', public.custody_snapshot(_t.to_custody_id));

  SELECT email INTO _email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.cash_transfer_repairs
    (project_id, transfer_id, custody_id, custody_name, amount, transfer_date,
     missing_fund_id, reason, before_snapshot, after_snapshot, performed_by, performed_by_email)
  VALUES
    (_t.project_id, _t.id, _t.to_custody_id, _custody_name, _t.amount, _t.transfer_date,
     _t.from_fund_id, btrim(_reason), _before, _after, auth.uid(), _email)
  RETURNING id INTO _row_id;

  INSERT INTO public.system_audit_log
    (user_id, user_email, action, entity_type, entity_id, entity_name, details)
  VALUES (
    auth.uid(), _email, 'orphan_cash_transfer_repair', 'cash_transfer', _t.id,
    'حذف تحويل بلا دفعة أصل — ' || _t.amount::text,
    jsonb_build_object('repair_id', _row_id, 'reason', btrim(_reason),
                       'before', _before, 'after', _after)
  );

  RETURN jsonb_build_object('repair_id', _row_id, 'before', _before, 'after', _after);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.repair_orphan_cash_transfer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_orphan_cash_transfer(uuid, text) TO authenticated;