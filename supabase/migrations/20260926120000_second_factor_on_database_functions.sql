-- Recorded in the live ledger on 26 September as
-- second_factor_on_database_functions, but never committed. Reconstructed
-- byte-for-byte from the live function definitions on 1 October 2026 so a
-- database rebuilt from the repository has them. Idempotent: CREATE OR
-- REPLACE with the live bodies, and the live grants.
--
-- The SECURITY DEFINER functions bypass row-level security, so the
-- restrictive second-factor policy of 20260924150000 does not reach them;
-- each now calls require_second_factor() first.

CREATE OR REPLACE FUNCTION public.require_second_factor()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.second_factor_ok() THEN
    RAISE EXCEPTION 'أكمل التحقق بخطوتين لهذه الجلسة أولاً.' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.explain_attachment_access(_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _roles jsonb;
  _matches jsonb := '[]'::jsonb;
  _rec record;
  _allowed boolean := false;
  _bucket text;
BEGIN PERFORM public.require_second_factor();
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('path', _path, 'decision', 'deny', 'reason', 'no_session');
  END IF;

  _is_admin := public.has_role(_uid, 'admin') OR public.has_role(_uid, 'owner');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'role', r.role, 'scope_type', r.scope_type, 'scope_id', r.scope_id)), '[]'::jsonb)
    INTO _roles
    FROM public.user_roles r
   WHERE r.user_id = _uid;

  FOR _rec IN
    SELECT * FROM (
      SELECT 'expenses'::text AS source, 'expense-receipts'::text AS bucket,
             e.id AS record_id, e.project_id, e.user_id AS record_owner
        FROM public.expenses e
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.receipt_attachments, '[]'::jsonb)) a
       WHERE a->>'path' = _path
      UNION ALL
      SELECT 'resource_reimbursements', 'resource-receipts', r.id, r.project_id, r.user_id
        FROM public.resource_reimbursements r
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.receipt_attachments, '[]'::jsonb)) a
       WHERE a->>'path' = _path
      UNION ALL
      SELECT 'payment_requests', 'resource-receipts', p.id, p.project_id, p.user_id
        FROM public.payment_requests p
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payment_attachments, '[]'::jsonb)) a
       WHERE a->>'path' = _path
      UNION ALL
      SELECT 'fund_settlements', 'resource-receipts', f.id, f.project_id, NULL::uuid
        FROM public.fund_settlements f
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.attachments, '[]'::jsonb)) a
       WHERE a->>'path' = _path
    ) m
  LOOP
    DECLARE
      _has_access boolean := public.has_access(_uid, 'project', _rec.project_id);
      _can_edit   boolean := public.can_edit(_uid, 'project', _rec.project_id);
      _visible    boolean;
      _pname text; _cid uuid;
    BEGIN
      _visible := _is_admin OR _has_access;
      IF _visible THEN
        SELECT name, company_id INTO _pname, _cid FROM public.projects WHERE id = _rec.project_id;
      END IF;
      _bucket := COALESCE(_bucket, _rec.bucket);
      IF _is_admin OR _has_access THEN _allowed := true; END IF;

      _matches := _matches || jsonb_build_object(
        'source', _rec.source,
        'bucket', _rec.bucket,
        'record_id', CASE WHEN _visible THEN _rec.record_id ELSE NULL END,
        'project_id', CASE WHEN _visible THEN _rec.project_id ELSE NULL END,
        'project_name', _pname,
        'company_id', _cid,
        'is_record_owner', _rec.record_owner IS NOT NULL AND _rec.record_owner = _uid,
        'checks', jsonb_build_array(
          jsonb_build_object('rule', 'has_role(admin|owner)', 'passed', _is_admin,
            'detail', 'دور نظامي يمنح الوصول لكل المرفقات'),
          jsonb_build_object('rule', 'has_access(project)', 'passed', _has_access,
            'detail', 'دور على المشروع أو شركته (cascade)'),
          jsonb_build_object('rule', 'can_edit(project)', 'passed', _can_edit,
            'detail', 'صلاحية التعديل — غير مطلوبة للقراءة')
        ),
        'decision', CASE WHEN _is_admin OR _has_access THEN 'allow' ELSE 'deny' END
      );
    END;
  END LOOP;

  -- The disclosure guard.
  --
  -- Reaching here with `_allowed` false means either the path matched nothing,
  -- or every match belongs to a project the caller has no role on. Those two
  -- must be indistinguishable to an ordinary caller — telling them apart is
  -- the whole leak.
  --
  -- An admin is the exception, and deliberately so: they are entitled to the
  -- answer, so collapsing their case too would have the tool report
  -- "not authorized" to someone who *is* authorized. An audit tool that
  -- misstates its own verdict is worse than one that says less, and for an
  -- admin the only way to land here is a genuinely orphaned path.
  IF NOT _allowed THEN
    IF _is_admin THEN
      RETURN jsonb_build_object(
        'path', _path,
        'checked_at', now(),
        'subject', jsonb_build_object('user_id', _uid, 'is_system_admin', true, 'roles', _roles),
        'bucket', NULL,
        'matches', '[]'::jsonb,
        'match_count', 0,
        'decision', 'deny',
        'reason', 'orphan_path_no_matching_record'
      );
    END IF;

    RETURN jsonb_build_object(
      'path', _path,
      'checked_at', now(),
      'subject', jsonb_build_object('user_id', _uid, 'is_system_admin', false, 'roles', _roles),
      'decision', 'deny',
      'reason', 'not_authorized'
    );
  END IF;

  RETURN jsonb_build_object(
    'path', _path,
    'checked_at', now(),
    'subject', jsonb_build_object('user_id', _uid, 'is_system_admin', _is_admin, 'roles', _roles),
    'bucket', _bucket,
    'matches', _matches,
    'match_count', jsonb_array_length(_matches),
    'decision', 'allow',
    'reason', CASE WHEN _is_admin THEN 'admin_role' ELSE 'project_scope_access' END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.project_financial_summary(_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
BEGIN PERFORM public.require_second_factor();
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

CREATE OR REPLACE FUNCTION public.repair_orphan_cash_transfer(_transfer_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _t public.cash_transfers%ROWTYPE;
  _custody_name text;
  _before jsonb;
  _after jsonb;
  _email text;
  _row_id uuid;
BEGIN PERFORM public.require_second_factor();
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
$function$;

CREATE OR REPLACE FUNCTION public.split_settle_advance(_payment_request_id uuid, _settle_amount numeric, _overflow_amount numeric, _overflow_source text, _overflow_fund_id uuid, _overflow_custody_id uuid, _category text, _description text, _date text, _month integer, _budget_item_id uuid, _notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pr          public.payment_requests%ROWTYPE;
  _uid         uuid := auth.uid();
  _outstanding numeric;
  _event_id    uuid;
  _expense_id  uuid;
BEGIN PERFORM public.require_second_factor();
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO _pr FROM public.payment_requests
   WHERE id = _payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_request_not_found' USING ERRCODE = 'P0001'; END IF;

  IF NOT public.can_edit(_uid, 'project'::scope_type, _pr.project_id) THEN
    RAISE EXCEPTION 'insufficient_permission' USING ERRCODE = 'P0001';
  END IF;

  IF _pr.request_type <> 'advance' OR NOT _pr.is_advance_outstanding THEN
    RAISE EXCEPTION 'advance_not_outstanding' USING ERRCODE = 'P0001';
  END IF;

  IF _settle_amount <= 0 OR _overflow_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amounts' USING ERRCODE = 'P0001';
  END IF;

  _outstanding := GREATEST(_pr.amount - COALESCE(_pr.refunded_amount, 0), 0);
  IF _settle_amount > _outstanding THEN
    RAISE EXCEPTION 'settle_exceeds_outstanding' USING ERRCODE = 'P0001';
  END IF;

  IF _overflow_source = 'fund' THEN
    IF _overflow_fund_id IS NULL THEN RAISE EXCEPTION 'fund_required' USING ERRCODE = 'P0001'; END IF;
  ELSIF _overflow_source = 'custody' THEN
    IF _overflow_custody_id IS NULL THEN RAISE EXCEPTION 'custody_required' USING ERRCODE = 'P0001'; END IF;
  ELSE
    RAISE EXCEPTION 'invalid_overflow_source' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.expenses(
    user_id, project_id, budget_item_id, category, description, amount,
    date, month, resource_id, notes, fund_id, custody_id,
    source_payment_request_id, approval_status, approved_by, is_vat_exempt
  ) VALUES (
    _uid, _pr.project_id, _budget_item_id, _category, _description, _overflow_amount,
    _date, _month, _pr.resource_id,
    'فائض تسوية سلفة #' || _payment_request_id::text
      || COALESCE(' — ' || NULLIF(btrim(_notes), ''), ''),
    CASE WHEN _overflow_source = 'fund'    THEN _overflow_fund_id    END,
    CASE WHEN _overflow_source = 'custody' THEN _overflow_custody_id END,
    _payment_request_id, 'approved', _uid::text, false
  ) RETURNING id INTO _expense_id;

  INSERT INTO public.settlement_events(
    payment_request_id, project_id, event_type, amount,
    expense_id, overflow_expense_id, notes, created_by
  ) VALUES (
    _payment_request_id, _pr.project_id, 'documented', _settle_amount,
    NULL, _expense_id, NULLIF(btrim(_notes), ''), _uid
  ) RETURNING id INTO _event_id;

  RETURN jsonb_build_object(
    'event_id', _event_id,
    'expense_id', _expense_id,
    'overflow_amount', _overflow_amount,
    'settle_amount', _settle_amount
  );
END $function$;

CREATE OR REPLACE FUNCTION public.ssot_explain(_key text, _project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sql   text;
  _result numeric;
  _plan  jsonb;
BEGIN PERFORM public.require_second_factor();
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
END $function$;

REVOKE EXECUTE ON FUNCTION public.require_second_factor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_second_factor() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.explain_attachment_access(_path text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.explain_attachment_access(_path text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.project_financial_summary(_project_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_financial_summary(_project_id uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.repair_orphan_cash_transfer(_transfer_id uuid, _reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_orphan_cash_transfer(_transfer_id uuid, _reason text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.split_settle_advance(_payment_request_id uuid, _settle_amount numeric, _overflow_amount numeric, _overflow_source text, _overflow_fund_id uuid, _overflow_custody_id uuid, _category text, _description text, _date text, _month integer, _budget_item_id uuid, _notes text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_settle_advance(_payment_request_id uuid, _settle_amount numeric, _overflow_amount numeric, _overflow_source text, _overflow_fund_id uuid, _overflow_custody_id uuid, _category text, _description text, _date text, _month integer, _budget_item_id uuid, _notes text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ssot_explain(_key text, _project_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ssot_explain(_key text, _project_id uuid) TO authenticated, service_role;

-- Also part of the block applied on 26 September, and missing from the
-- reconstruction above: without them a database rebuilt from the repository
-- leaves two functions open to every signed-in user, and stops at
-- 20261002124012, which alters plpgsql_block_begin.
--
-- custody_snapshot and fund_total_spent check no access at all: any
-- signed-in user could read any custody's or fund's totals by id. The app
-- never calls them; only other definer functions do, which run as the owner
-- and keep their right to. So users lose it.
REVOKE EXECUTE ON FUNCTION public.custody_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fund_total_spent(uuid) FROM PUBLIC, anon, authenticated;

-- plpgsql_block_begin(body) returns where a plpgsql body's own BEGIN starts,
-- skipping comments, quoted strings and names, and dollar-quoted text: the
-- block used it to put the guard after that BEGIN, since a text search had
-- put it inside a comment that said "begin". A later block that guards new
-- functions the same way needs it.
CREATE OR REPLACE FUNCTION public.plpgsql_block_begin(body text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $f$
DECLARE
  pos int := 1;
  n int := length(body);
  c text;
  tag text;
  stop int;
BEGIN
  WHILE pos <= n LOOP
    c := substr(body, pos, 1);
    IF substr(body, pos, 2) = '--' THEN
      stop := strpos(substr(body, pos), E'\n');
      pos := CASE WHEN stop = 0 THEN n + 1 ELSE pos + stop END;
      CONTINUE;
    ELSIF substr(body, pos, 2) = '/*' THEN
      stop := strpos(substr(body, pos + 2), '*/');
      pos := CASE WHEN stop = 0 THEN n + 1 ELSE pos + 2 + stop + 1 END;
      CONTINUE;
    ELSIF c = '''' OR c = '"' THEN
      pos := pos + 1;
      LOOP
        EXIT WHEN pos > n;
        IF substr(body, pos, 1) = c THEN
          IF substr(body, pos + 1, 1) = c THEN pos := pos + 2; CONTINUE; END IF;
          EXIT;
        END IF;
        pos := pos + 1;
      END LOOP;
      pos := pos + 1;
      CONTINUE;
    ELSIF c = '$' THEN
      tag := substring(substr(body, pos) FROM '^\$[A-Za-z_]*\$');
      IF tag IS NOT NULL THEN
        stop := strpos(substr(body, pos + length(tag)), tag);
        pos := CASE WHEN stop = 0 THEN n + 1 ELSE pos + length(tag) + stop - 1 + length(tag) END;
        CONTINUE;
      END IF;
    ELSIF upper(substr(body, pos, 5)) = 'BEGIN'
      AND (pos = 1 OR substr(body, pos - 1, 1) !~ '[A-Za-z0-9_$]')
      AND substr(body, pos + 5, 1) !~ '[A-Za-z0-9_$]' THEN
      RETURN pos;
    END IF;
    pos := pos + 1;
  END LOOP;
  RETURN 0;
END;
$f$;
REVOKE ALL ON FUNCTION public.plpgsql_block_begin(text) FROM PUBLIC, anon, authenticated;
