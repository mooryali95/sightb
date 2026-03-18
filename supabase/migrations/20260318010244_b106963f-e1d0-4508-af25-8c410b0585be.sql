ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS budget_items_json JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS auto_rebaseline BOOLEAN DEFAULT true;