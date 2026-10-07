ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS paid_hours_override numeric NULL,
  ADD COLUMN IF NOT EXISTS unpaid_hours_override numeric NULL;