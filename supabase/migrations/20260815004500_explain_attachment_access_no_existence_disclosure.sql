-- explain_attachment_access: stop disclosing existence on the deny path.
--
-- The diagnostic returned `source`, `bucket` and `match_count` even when it
-- denied, and used two different reason codes — `orphan_path_no_matching_record`
-- when nothing referenced the path, `no_role_on_owning_project` when something
-- did. Those two responses are trivially distinguishable, so any authenticated
-- caller could probe an arbitrary path and learn whether it exists and which
-- table holds it. The storage policy it is meant to explain simply denies; the
-- explainer was answering more than the thing it describes.
--
-- Callers who are actually entitled to the answer — a system admin/owner, or a
-- user with a role on the owning project — still get the full rule-by-rule
-- trace, unchanged. Everyone else now gets one uniform denial in which an
-- orphan path and a real-but-forbidden path are indistinguishable.
--
-- Behaviour deltas, and nothing else:
--   admin / owner        → unchanged (full detail)
--   role on the project  → unchanged (full detail)
--   no session           → unchanged (`no_session`)
--   anyone else          → uniform `{decision: deny, reason: not_authorized}`

CREATE OR REPLACE FUNCTION public.explain_attachment_access(_path text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
BEGIN
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

REVOKE ALL ON FUNCTION public.explain_attachment_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.explain_attachment_access(text) TO authenticated;
