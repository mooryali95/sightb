CREATE OR REPLACE FUNCTION public.project_financial_summary(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _p                  public.projects%ROWTYPE;
  _co                 numeric;
  _rev_collected      numeric;
  _rev_invoiced       numeric;
  _expenses           numeric;
  _expenses_rejected  numeric;
  _funds_total        numeric;
  _custody_draw       numeric;
  _cash_out           numeric;
  _advances_out       numeric;
  _settled            numeric;
  _payables_resource  numeric;
  _payables_vendor    numeric;
  _direct_spent       numeric;
  _act_total          numeric;
  _act_direct         numeric;
  _act_custody        numeric;
  _act_advances       numeric;
  _act_cash_out       numeric;
  _cust_available     numeric;
  _cust_spent         numeric;
  _cust_advances      numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.has_access(auth.uid(), 'project'::scope_type, _project_id) THEN
    RAISE EXCEPTION 'insufficient_permission' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _p FROM public.projects WHERE id = _project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(amount_impact), 0) INTO _co
    FROM public.change_orders WHERE project_id = _project_id AND status = 'approved';

  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'received'), 0),
         COALESCE(SUM(amount) FILTER (WHERE status IN ('invoiced', 'received')), 0)
    INTO _rev_collected, _rev_invoiced
    FROM public.revenues WHERE project_id = _project_id;

  SELECT COALESCE(SUM(amount) FILTER (WHERE approval_status <> 'rejected'), 0),
         COALESCE(SUM(amount) FILTER (WHERE approval_status = 'rejected'), 0)
    INTO _expenses, _expenses_rejected
    FROM public.expenses WHERE project_id = _project_id;

  SELECT COALESCE(SUM(amount), 0) INTO _funds_total
    FROM public.project_funds WHERE project_id = _project_id;

  SELECT COALESCE(SUM(cu.amount), 0) INTO _custody_draw
    FROM public.custodies cu
    JOIN public.project_funds pf ON pf.id = cu.source_fund_id
   WHERE pf.project_id = _project_id;

  SELECT COALESCE(SUM(ct.amount), 0) INTO _cash_out
    FROM public.cash_transfers ct
    JOIN public.project_funds pf ON pf.id = ct.from_fund_id
   WHERE pf.project_id = _project_id;

  SELECT COALESCE(SUM(GREATEST(amount - COALESCE(refunded_amount, 0), 0)), 0) INTO _advances_out
    FROM public.payment_requests
   WHERE project_id = _project_id
     AND request_type = 'advance'
     AND status = 'paid'
     AND is_advance_outstanding = true;

  SELECT COALESCE(SUM(fs.total_spent), 0) INTO _settled
    FROM public.fund_settlements fs
    JOIN public.project_funds pf ON pf.id = fs.fund_id
   WHERE pf.project_id = _project_id AND fs.status = 'approved';

  SELECT COALESCE(SUM(amount) FILTER (WHERE source_kind = 'resource'), 0),
         COALESCE(SUM(amount) FILTER (WHERE source_kind = 'vendor'), 0)
    INTO _payables_resource, _payables_vendor
    FROM public.resource_reimbursements
   WHERE project_id = _project_id AND status <> 'rejected' AND status <> 'reimbursed';

  -- Direct spend on a fund EXCLUDES expenses booked inside a custody drawn
  -- from that same fund (the custody amount already drained the fund).
  SELECT COALESCE(SUM(e.amount), 0) INTO _direct_spent
    FROM public.expenses e
    LEFT JOIN public.custodies cu ON cu.id = e.custody_id
   WHERE e.project_id = _project_id
     AND e.fund_id IS NOT NULL
     AND e.approval_status <> 'rejected'
     AND (cu.id IS NULL OR cu.source_fund_id IS DISTINCT FROM e.fund_id);

  SELECT COALESCE(SUM(amount), 0) INTO _act_total
    FROM public.project_funds
   WHERE project_id = _project_id AND status IN ('transferred', 'acknowledged');

  SELECT COALESCE(SUM(e.amount), 0) INTO _act_direct
    FROM public.expenses e
    JOIN public.project_funds pf ON pf.id = e.fund_id
    LEFT JOIN public.custodies cu ON cu.id = e.custody_id
   WHERE pf.project_id = _project_id
     AND pf.status IN ('transferred', 'acknowledged')
     AND e.approval_status <> 'rejected'
     AND (cu.id IS NULL OR cu.source_fund_id IS DISTINCT FROM e.fund_id);

  SELECT COALESCE(SUM(cu.amount), 0) INTO _act_custody
    FROM public.custodies cu
    JOIN public.project_funds pf ON pf.id = cu.source_fund_id
   WHERE pf.project_id = _project_id AND pf.status IN ('transferred', 'acknowledged');

  SELECT COALESCE(SUM(GREATEST(pr.amount - COALESCE(pr.refunded_amount, 0), 0)), 0) INTO _act_advances
    FROM public.payment_requests pr
    JOIN public.project_funds pf ON pf.id = pr.paid_from_fund_id
   WHERE pf.project_id = _project_id
     AND pf.status IN ('transferred', 'acknowledged')
     AND pr.request_type = 'advance'
     AND pr.status = 'paid'
     AND pr.is_advance_outstanding = true;

  SELECT COALESCE(SUM(ct.amount), 0) INTO _act_cash_out
    FROM public.cash_transfers ct
    JOIN public.project_funds pf ON pf.id = ct.from_fund_id
   WHERE pf.project_id = _project_id AND pf.status IN ('transferred', 'acknowledged');

  -- === Custody SSOT: available = amount + incoming cash transfers ===
  SELECT COALESCE(SUM(cu.amount), 0)
       + COALESCE((
           SELECT SUM(ct.amount) FROM public.cash_transfers ct
            JOIN public.custodies c2 ON c2.id = ct.to_custody_id
           WHERE c2.project_id = _project_id AND c2.status = 'active'
         ), 0)
    INTO _cust_available
    FROM public.custodies cu
   WHERE cu.project_id = _project_id AND cu.status = 'active';

  SELECT COALESCE(SUM(e.amount), 0) INTO _cust_spent
    FROM public.expenses e
    JOIN public.custodies cu ON cu.id = e.custody_id
   WHERE cu.project_id = _project_id
     AND cu.status = 'active'
     AND e.approval_status <> 'rejected';

  SELECT COALESCE(SUM(GREATEST(pr.amount - COALESCE(pr.refunded_amount, 0), 0)), 0) INTO _cust_advances
    FROM public.payment_requests pr
    JOIN public.custodies cu ON cu.id = pr.paid_from_custody_id
   WHERE cu.project_id = _project_id
     AND cu.status = 'active'
     AND pr.request_type = 'advance'
     AND pr.status = 'paid'
     AND pr.is_advance_outstanding = true;

  RETURN jsonb_build_object(
    'project_id', _project_id,
    'currency', _p.currency,
    'computed_at', now(),
    'contract_value', _p.contract_value,
    'approved_change_orders', _co,
    'revised_contract_value', _p.contract_value + _co,
    'collected_revenue', _rev_collected,
    'invoiced_revenue', _rev_invoiced,
    'total_actual_expenses', _expenses,
    'rejected_expenses', _expenses_rejected,
    'total_transferred_funds', _funds_total,
    'total_custody_draw', _custody_draw,
    'total_cash_transfers_out', _cash_out,
    'outstanding_advances', _advances_out,
    'settled_amount', _settled,
    'fund_direct_spent', _direct_spent,
    'outstanding_payables_resource', _payables_resource,
    'outstanding_payables_vendor', _payables_vendor,
    'custody_available', _cust_available,
    'custody_spent', _cust_spent,
    'custody_outstanding_advances', _cust_advances,
    'custody_in_hand', _cust_available - _cust_spent - _cust_advances,
    'remaining_funds', _act_total - _act_direct - _act_custody - _act_advances - _act_cash_out,
    'profit', (_p.contract_value + _co) - _expenses,
    'margin_percent', CASE
      WHEN (_p.contract_value + _co) = 0 THEN 0
      ELSE ROUND((((_p.contract_value + _co) - _expenses) / (_p.contract_value + _co)) * 100, 2)
    END
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.project_financial_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_financial_summary(uuid) TO authenticated;