-- 1) Immutability of user_id (ownership) on business tables
CREATE OR REPLACE FUNCTION public.prevent_owner_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     AND NOT public.has_role(auth.uid(), 'owner')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'لا يمكن تغيير مالك السجل (user_id)';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_owner_reassignment() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','portfolios','projects','budget_items','expenses','revenues',
    'resources','milestones','change_orders','risks','custodies','cost_baselines',
    'indirect_costs','periodic_snapshots','commitments','cash_transfers',
    'budget_amendments','resource_reimbursements','payment_requests','resource_settlements'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_immutable_owner ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_immutable_owner BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_reassignment()', t);
  END LOOP;
END $$;

-- 2) Storage: link-aware access checks
CREATE OR REPLACE FUNCTION public.can_access_expense_receipt(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expenses e
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.receipt_attachments, '[]'::jsonb)) a
    WHERE a->>'path' = _path
      AND (public.has_role(auth.uid(), 'admin')
           OR public.has_access(auth.uid(), 'project', e.project_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_resource_receipt(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.resource_reimbursements r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.receipt_attachments, '[]'::jsonb)) a
    WHERE a->>'path' = _path
      AND (public.has_role(auth.uid(), 'admin')
           OR public.has_access(auth.uid(), 'project', r.project_id))
  )
  OR EXISTS (
    SELECT 1
    FROM public.payment_requests p
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payment_attachments, '[]'::jsonb)) a
    WHERE a->>'path' = _path
      AND (public.has_role(auth.uid(), 'admin')
           OR public.has_access(auth.uid(), 'project', p.project_id))
  )
  OR EXISTS (
    SELECT 1
    FROM public.fund_settlements f
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.attachments, '[]'::jsonb)) a
    WHERE a->>'path' = _path
      AND (public.has_role(auth.uid(), 'admin')
           OR public.has_access(auth.uid(), 'project', f.project_id))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_expense_receipt(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_resource_receipt(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_expense_receipt(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_resource_receipt(text) TO authenticated;

-- expense-receipts: uploader OR someone with access to the linked expense's project
DROP POLICY IF EXISTS "Users can view own receipts" ON storage.objects;
CREATE POLICY "Expense receipts readable by uploader or project members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.can_access_expense_receipt(name)
  )
);

-- resource-receipts: require project access AND (uploader or an actual linked record)
DROP POLICY IF EXISTS "Users can view receipts for accessible projects" ON storage.objects;
CREATE POLICY "Resource receipts readable when linked to accessible record"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'resource-receipts'
  AND (
    owner = auth.uid()
    OR public.can_access_resource_receipt(name)
    OR (
      public.has_role(auth.uid(), 'admin')
      AND public.has_access(auth.uid(), 'project', ((storage.foldername(name))[1])::uuid)
    )
  )
);
