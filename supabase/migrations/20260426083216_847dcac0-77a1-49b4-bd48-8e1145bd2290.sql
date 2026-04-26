-- ═══════════════════════════════════════════════
-- وحدة إدارة صرفيات المشروع (Revolving Fund)
-- ═══════════════════════════════════════════════

-- 1) Enums
CREATE TYPE public.fund_status AS ENUM ('transferred', 'acknowledged', 'settled', 'pending_next');
CREATE TYPE public.settlement_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- 2) جدول الدفعات (project_funds)
CREATE TABLE public.project_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  fund_number integer NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount > 0),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  status public.fund_status NOT NULL DEFAULT 'transferred',
  notes text,
  created_by uuid NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, fund_number)
);

CREATE INDEX idx_project_funds_project ON public.project_funds(project_id);
CREATE INDEX idx_project_funds_status ON public.project_funds(status);

-- 3) جدول التسويات (fund_settlements)
CREATE TABLE public.fund_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL UNIQUE REFERENCES public.project_funds(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  total_received numeric NOT NULL DEFAULT 0,
  total_spent numeric NOT NULL DEFAULT 0,
  remaining_cash numeric NOT NULL DEFAULT 0,
  difference numeric GENERATED ALWAYS AS (total_received - total_spent - remaining_cash) STORED,
  settled_by uuid,
  approved_by uuid,
  settlement_date timestamptz,
  approval_date timestamptz,
  status public.settlement_status NOT NULL DEFAULT 'draft',
  rejection_reason text,
  difference_reason text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fund_settlements_project ON public.fund_settlements(project_id);
CREATE INDEX idx_fund_settlements_fund ON public.fund_settlements(fund_id);
CREATE INDEX idx_fund_settlements_status ON public.fund_settlements(status);

-- 4) إضافة fund_id إلى expenses
ALTER TABLE public.expenses
  ADD COLUMN fund_id uuid;

CREATE INDEX idx_expenses_fund ON public.expenses(fund_id);

-- 5) Trigger لإعادة حساب total_spent عند تغيّر expenses
CREATE OR REPLACE FUNCTION public.recalc_fund_settlement_spent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected_funds uuid[];
  _f uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _affected_funds := ARRAY[NEW.fund_id];
  ELSIF TG_OP = 'UPDATE' THEN
    _affected_funds := ARRAY[NEW.fund_id, OLD.fund_id];
  ELSIF TG_OP = 'DELETE' THEN
    _affected_funds := ARRAY[OLD.fund_id];
  END IF;

  FOREACH _f IN ARRAY _affected_funds LOOP
    IF _f IS NOT NULL THEN
      UPDATE public.fund_settlements fs
      SET total_spent = COALESCE((
        SELECT SUM(e.amount) FROM public.expenses e WHERE e.fund_id = _f
      ), 0),
      updated_at = now()
      WHERE fs.fund_id = _f;
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expenses_recalc_fund_spent
AFTER INSERT OR UPDATE OF amount, fund_id OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.recalc_fund_settlement_spent();

-- 6) Trigger لتحديث updated_at على funds و settlements
CREATE OR REPLACE FUNCTION public.touch_fund_tables_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_funds_touch
BEFORE UPDATE ON public.project_funds
FOR EACH ROW EXECUTE FUNCTION public.touch_fund_tables_updated_at();

CREATE TRIGGER trg_fund_settlements_touch
BEFORE UPDATE ON public.fund_settlements
FOR EACH ROW EXECUTE FUNCTION public.touch_fund_tables_updated_at();

-- 7) RLS
ALTER TABLE public.project_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_settlements ENABLE ROW LEVEL SECURITY;

-- project_funds: عرض لمن لديه وصول للمشروع
CREATE POLICY "Users can view project funds"
ON public.project_funds FOR SELECT TO authenticated
USING (has_access(auth.uid(), 'project'::scope_type, project_id));

-- إنشاء الدفعة: Admin فقط (الإدارة)
CREATE POLICY "Admins can create project funds"
ON public.project_funds FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND auth.uid() = created_by
);

-- تحديث الدفعة: Admin (للحالة) أو Editor للإقرار (acknowledge)
CREATE POLICY "Authorized users can update project funds"
ON public.project_funds FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR can_edit(auth.uid(), 'project'::scope_type, project_id)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR can_edit(auth.uid(), 'project'::scope_type, project_id)
);

-- حذف الدفعة: Admin فقط
CREATE POLICY "Admins can delete project funds"
ON public.project_funds FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- fund_settlements
CREATE POLICY "Users can view fund settlements"
ON public.fund_settlements FOR SELECT TO authenticated
USING (has_access(auth.uid(), 'project'::scope_type, project_id));

-- إنشاء التسوية: Editor (مدير المشروع) أو Admin
CREATE POLICY "Editors can create settlements"
ON public.fund_settlements FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR can_edit(auth.uid(), 'project'::scope_type, project_id)
);

-- تحديث التسوية: Editor (لتعبئة draft و submit) أو Admin (للاعتماد/الرفض)
CREATE POLICY "Editors and admins can update settlements"
ON public.fund_settlements FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR can_edit(auth.uid(), 'project'::scope_type, project_id)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR can_edit(auth.uid(), 'project'::scope_type, project_id)
);

-- حذف التسوية: Admin فقط (وفقط draft)
CREATE POLICY "Admins can delete draft settlements"
ON public.fund_settlements FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND status = 'draft');
