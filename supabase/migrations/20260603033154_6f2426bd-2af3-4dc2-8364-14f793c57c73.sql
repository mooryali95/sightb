-- جدول تحويلات النقد من المدير إلى العهد
-- لا يُعدّ مصروفاً: يُنقص "النقد بيد المدير" (من دفعة مصدر) ويزيد رصيد العهدة المستهدفة
CREATE TABLE public.cash_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  from_fund_id UUID NOT NULL,
  to_custody_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount > 0),
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_transfers_project ON public.cash_transfers(project_id);
CREATE INDEX idx_cash_transfers_fund ON public.cash_transfers(from_fund_id);
CREATE INDEX idx_cash_transfers_custody ON public.cash_transfers(to_custody_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_transfers TO authenticated;
GRANT ALL ON public.cash_transfers TO service_role;

ALTER TABLE public.cash_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cash_transfers"
ON public.cash_transfers FOR SELECT TO authenticated
USING ((auth.uid() = user_id) OR has_access(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can insert cash_transfers"
ON public.cash_transfers FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) AND can_edit(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can delete cash_transfers"
ON public.cash_transfers FOR DELETE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can update cash_transfers"
ON public.cash_transfers FOR UPDATE TO authenticated
USING ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id))
WITH CHECK ((auth.uid() = user_id) OR can_edit(auth.uid(), 'project'::scope_type, project_id));
