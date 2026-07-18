
CREATE OR REPLACE FUNCTION public.ssot_explain(_key text, _project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sql   text;
  _result numeric;
  _plan  jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = 'P0001';
  END IF;

  _sql := CASE _key
    WHEN 'contract_value' THEN
      'SELECT contract_value FROM public.projects WHERE id = $1'
    WHEN 'approved_change_orders' THEN
      $q$SELECT COALESCE(SUM(amount_impact),0) FROM public.change_orders
          WHERE project_id = $1 AND status = 'approved'$q$
    WHEN 'collected_revenue' THEN
      $q$SELECT COALESCE(SUM(amount),0) FROM public.revenues
          WHERE project_id = $1 AND status = 'received'$q$
    WHEN 'total_actual_expenses' THEN
      $q$SELECT COALESCE(SUM(amount),0) FROM public.expenses
          WHERE project_id = $1 AND approval_status <> 'rejected'$q$
    WHEN 'outstanding_advances' THEN
      $q$SELECT COALESCE(SUM(GREATEST(amount - COALESCE(refunded_amount,0),0)),0)
          FROM public.payment_requests
          WHERE project_id = $1 AND request_type = 'advance'
            AND status = 'paid' AND is_advance_outstanding = true$q$
    WHEN 'total_transferred_funds' THEN
      'SELECT COALESCE(SUM(amount),0) FROM public.project_funds WHERE project_id = $1'
    WHEN 'total_cash_transfers_out' THEN
      $q$SELECT COALESCE(SUM(ct.amount),0)
           FROM public.cash_transfers ct
           JOIN public.project_funds pf ON pf.id = ct.from_fund_id
          WHERE pf.project_id = $1$q$
    WHEN 'total_custody_draw' THEN
      $q$SELECT COALESCE(SUM(cu.amount),0)
           FROM public.custodies cu
           JOIN public.project_funds pf ON pf.id = cu.source_fund_id
          WHERE pf.project_id = $1$q$
    WHEN 'settled_amount' THEN
      $q$SELECT COALESCE(SUM(fs.total_spent),0)
           FROM public.fund_settlements fs
           JOIN public.project_funds pf ON pf.id = fs.fund_id
          WHERE pf.project_id = $1 AND fs.status = 'approved'$q$
    ELSE NULL
  END;

  IF _sql IS NULL THEN
    RAISE EXCEPTION 'unknown_ssot_key: %', _key USING ERRCODE = 'P0001';
  END IF;

  EXECUTE _sql INTO _result USING _project_id;
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || _sql INTO _plan USING _project_id;

  RETURN jsonb_build_object(
    'key', _key,
    'sql', _sql,
    'result', _result,
    'plan', _plan
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.ssot_explain(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ssot_explain(text, uuid) TO authenticated;
