ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE public.member_rates (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hourly_rate numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_rates TO authenticated;
GRANT ALL ON public.member_rates TO service_role;
ALTER TABLE public.member_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rates admin read" ON public.member_rates FOR SELECT TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rates admin write" ON public.member_rates FOR INSERT TO authenticated WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rates admin update" ON public.member_rates FOR UPDATE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rates admin delete" ON public.member_rates FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));