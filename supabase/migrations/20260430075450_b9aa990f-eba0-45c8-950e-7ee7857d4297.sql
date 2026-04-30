
-- ============================================================
-- Resource Payables Module: Reimbursements, Payment Requests, Settlements
-- ============================================================

-- ─── ENUMs ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.reimbursement_status AS ENUM ('pending_review','approved','reimbursed','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_request_type AS ENUM ('reimbursement','salary','bonus','advance','fund_top_up','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_request_status AS ENUM ('draft','submitted','under_review','approved','rejected','scheduled','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_priority AS ENUM ('normal','urgent','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('bank_transfer','cash','check','card');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.resource_settlement_status AS ENUM ('draft','signed','disputed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── (1) resource_reimbursements ────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  receipt_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_item_id uuid,
  status public.reimbursement_status NOT NULL DEFAULT 'pending_review',
  notes text,
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  payment_request_id uuid,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reimb_project ON public.resource_reimbursements(project_id);
CREATE INDEX IF NOT EXISTS idx_reimb_resource ON public.resource_reimbursements(resource_id);
CREATE INDEX IF NOT EXISTS idx_reimb_status ON public.resource_reimbursements(status);

ALTER TABLE public.resource_reimbursements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View reimbursements with project access"
  ON public.resource_reimbursements FOR SELECT TO authenticated
  USING (has_access(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can insert reimbursements"
  ON public.resource_reimbursements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND can_edit(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can update reimbursements"
  ON public.resource_reimbursements FOR UPDATE TO authenticated
  USING (can_edit(auth.uid(), 'project'::scope_type, project_id) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (can_edit(auth.uid(), 'project'::scope_type, project_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Editors can delete pending reimbursements"
  ON public.resource_reimbursements FOR DELETE TO authenticated
  USING (
    (can_edit(auth.uid(), 'project'::scope_type, project_id) AND status = 'pending_review')
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- ─── (2) payment_requests ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  request_type public.payment_request_type NOT NULL DEFAULT 'reimbursement',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ر.س',
  description text NOT NULL,
  justification text,
  linked_reimbursement_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_fund_id uuid,
  priority public.payment_priority NOT NULL DEFAULT 'normal',
  status public.payment_request_status NOT NULL DEFAULT 'draft',
  requested_by uuid NOT NULL,
  requested_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  approved_by uuid,
  approved_at timestamptz,
  approval_notes text,
  scheduled_date date,
  paid_date date,
  payment_method public.payment_method,
  payment_reference text,
  payment_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  auto_created_expense_id uuid,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payreq_project ON public.payment_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_payreq_resource ON public.payment_requests(resource_id);
CREATE INDEX IF NOT EXISTS idx_payreq_status ON public.payment_requests(status);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View payment requests with project access"
  ON public.payment_requests FOR SELECT TO authenticated
  USING (has_access(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can insert payment requests"
  ON public.payment_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND can_edit(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can update payment requests"
  ON public.payment_requests FOR UPDATE TO authenticated
  USING (can_edit(auth.uid(), 'project'::scope_type, project_id) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (can_edit(auth.uid(), 'project'::scope_type, project_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete payment requests"
  ON public.payment_requests FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND status IN ('draft','cancelled','rejected'));

-- ─── (3) resource_settlements ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL,
  project_id uuid,
  period_from date,
  period_to date,
  total_owed numeric NOT NULL DEFAULT 0,
  total_paid numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  linked_reimbursement_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_payment_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  settlement_text_ar text,
  status public.resource_settlement_status NOT NULL DEFAULT 'draft',
  signed_by_resource boolean NOT NULL DEFAULT false,
  signature_attachment text,
  signed_at timestamptz,
  notes text,
  created_by uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settle_resource ON public.resource_settlements(resource_id);
CREATE INDEX IF NOT EXISTS idx_settle_project ON public.resource_settlements(project_id);

ALTER TABLE public.resource_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View resource settlements with project access"
  ON public.resource_settlements FOR SELECT TO authenticated
  USING (
    project_id IS NULL
    OR has_access(auth.uid(), 'project'::scope_type, project_id)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Editors can insert settlements"
  ON public.resource_settlements FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (project_id IS NULL OR can_edit(auth.uid(), 'project'::scope_type, project_id) OR has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Editors can update draft settlements; admins always"
  ON public.resource_settlements FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (status = 'draft' AND (project_id IS NULL OR can_edit(auth.uid(), 'project'::scope_type, project_id)))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (status = 'draft' AND (project_id IS NULL OR can_edit(auth.uid(), 'project'::scope_type, project_id)))
  );

CREATE POLICY "Admins can delete unsigned settlements"
  ON public.resource_settlements FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND status <> 'signed');

-- ─── Triggers: updated_at ────────────────────────────────────
CREATE TRIGGER trg_reimb_updated_at BEFORE UPDATE ON public.resource_reimbursements
  FOR EACH ROW EXECUTE FUNCTION public.touch_fund_tables_updated_at();

CREATE TRIGGER trg_payreq_updated_at BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_fund_tables_updated_at();

CREATE TRIGGER trg_settle_updated_at BEFORE UPDATE ON public.resource_settlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_fund_tables_updated_at();

-- ─── Trigger: Protect signed settlements ─────────────────────
CREATE OR REPLACE FUNCTION public.protect_signed_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'signed' AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Cannot modify a signed settlement.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status = 'signed' THEN
    RAISE EXCEPTION 'Cannot delete a signed settlement. Cancel a draft instead.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_signed_settlement
  BEFORE UPDATE OR DELETE ON public.resource_settlements
  FOR EACH ROW EXECUTE FUNCTION public.protect_signed_settlement();

-- ─── Trigger: Auto-create expense on payment ─────────────────
CREATE OR REPLACE FUNCTION public.auto_create_expense_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r record;
  _resource_name text;
  _expense_id uuid;
  _category text;
  _ids uuid[];
  _id uuid;
BEGIN
  -- Only fire when status transitions to 'paid' for reimbursement type
  IF NEW.status = 'paid' AND COALESCE(OLD.status, 'draft'::payment_request_status) <> 'paid'
     AND NEW.request_type = 'reimbursement' AND NEW.auto_created_expense_id IS NULL THEN

    SELECT name INTO _resource_name FROM public.resources WHERE id = NEW.resource_id;

    -- Pick category from first linked reimbursement, fallback 'other'
    _category := 'other';
    IF jsonb_array_length(NEW.linked_reimbursement_ids) > 0 THEN
      SELECT category INTO _category FROM public.resource_reimbursements
      WHERE id = (NEW.linked_reimbursement_ids->>0)::uuid;
      IF _category IS NULL THEN _category := 'other'; END IF;
    END IF;

    INSERT INTO public.expenses (
      project_id, resource_id, category, description, amount,
      date, month, vendor, approval_status, approved_by,
      notes, user_id, is_vat_exempt
    ) VALUES (
      NEW.project_id, NEW.resource_id, _category,
      'استرداد: ' || NEW.description,
      NEW.amount,
      COALESCE(NEW.paid_date::text, CURRENT_DATE::text),
      EXTRACT(MONTH FROM COALESCE(NEW.paid_date, CURRENT_DATE))::int,
      _resource_name,
      'approved',
      COALESCE(NEW.approved_by::text, NEW.user_id::text),
      'منشأ تلقائياً من طلب صرف #' || NEW.id::text,
      NEW.user_id,
      false
    ) RETURNING id INTO _expense_id;

    NEW.auto_created_expense_id := _expense_id;

    -- Mark linked reimbursements as reimbursed
    IF jsonb_array_length(NEW.linked_reimbursement_ids) > 0 THEN
      SELECT array_agg((value)::text::uuid) INTO _ids
      FROM jsonb_array_elements_text(NEW.linked_reimbursement_ids);
      UPDATE public.resource_reimbursements
      SET status = 'reimbursed', payment_request_id = NEW.id
      WHERE id = ANY(_ids);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_expense
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_expense_on_payment();

-- ─── System Audit triggers ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.system_audit_resource_payables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
  _action text;
  _entity_name text;
BEGIN
  IF _user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT email INTO _email FROM public.profiles WHERE id = _user_id;

  IF TG_OP = 'INSERT' THEN
    _action := 'insert';
    _entity_name := COALESCE(NEW.description, TG_TABLE_NAME);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, TG_TABLE_NAME, NEW.id, _entity_name, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'update';
    _entity_name := COALESCE(NEW.description, TG_TABLE_NAME);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, TG_TABLE_NAME, NEW.id, _entity_name,
            jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'delete';
    _entity_name := COALESCE(OLD.description, TG_TABLE_NAME);
    INSERT INTO system_audit_log (user_id, user_email, action, entity_type, entity_id, entity_name, details)
    VALUES (_user_id, _email, _action, TG_TABLE_NAME, OLD.id, _entity_name, to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_audit_reimb AFTER INSERT OR UPDATE OR DELETE ON public.resource_reimbursements
  FOR EACH ROW EXECUTE FUNCTION public.system_audit_resource_payables();
CREATE TRIGGER trg_audit_payreq AFTER INSERT OR UPDATE OR DELETE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.system_audit_resource_payables();
CREATE TRIGGER trg_audit_settle AFTER INSERT OR UPDATE OR DELETE ON public.resource_settlements
  FOR EACH ROW EXECUTE FUNCTION public.system_audit_resource_payables();

-- ─── Storage Bucket: resource-receipts (private) ─────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('resource-receipts', 'resource-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can view receipts for accessible projects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'resource-receipts'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_access(auth.uid(), 'project'::scope_type, ((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "Editors can upload receipts to their projects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'resource-receipts'
    AND can_edit(auth.uid(), 'project'::scope_type, ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Editors can update their receipts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'resource-receipts'
    AND can_edit(auth.uid(), 'project'::scope_type, ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Editors can delete receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'resource-receipts'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR can_edit(auth.uid(), 'project'::scope_type, ((storage.foldername(name))[1])::uuid)
    )
  );

-- ─── Realtime ────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.resource_reimbursements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.resource_settlements;
