
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN DEFAULT false;
ALTER TABLE public.revenues ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL;
