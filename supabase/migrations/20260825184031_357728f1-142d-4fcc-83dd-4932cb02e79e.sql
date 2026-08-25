UPDATE public.clients SET email = '' WHERE email IS NULL;
ALTER TABLE public.clients ALTER COLUMN email SET NOT NULL;
ALTER TABLE public.clients ALTER COLUMN business_name DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN phone DROP NOT NULL;