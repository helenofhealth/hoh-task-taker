CREATE OR REPLACE FUNCTION public.guard_client_task_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_staff(auth.uid()) THEN
    NEW.approval_status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.source := 'client_request';
    NEW.status := 'requested';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_client_task_insert() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS guard_client_task_insert ON public.tasks;
CREATE TRIGGER guard_client_task_insert BEFORE INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_client_task_insert();