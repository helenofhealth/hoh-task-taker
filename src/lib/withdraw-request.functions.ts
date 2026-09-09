import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Lets a client cancel their own still-pending request. Clients cannot set the
 * soft-delete columns directly (a database guard resets them), so the removal
 * happens server-side after checking the request really belongs to them.
 */
export const withdrawTaskRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { taskId: string }) => {
    if (!input?.taskId) throw new Error("Task is required");
    return { taskId: input.taskId };
  })
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("client_id")
      .eq("id", context.userId)
      .maybeSingle();
    const clientId = (profile?.client_id as string | null) ?? null;

    const { data: task } = await context.supabase
      .from("tasks")
      .select("id, client_id, status, source, deleted_at")
      .eq("id", data.taskId)
      .maybeSingle();
    if (!task) throw new Error("Request not found");

    const { data: isStaff } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    const owns = clientId && (task as any).client_id === clientId;
    if (!isStaff && !owns) throw new Error("You can only withdraw your own requests");
    if ((task as any).status !== "requested" || (task as any).source !== "client_request") {
      throw new Error("This request has already been picked up — please ask the team instead");
    }
    if ((task as any).deleted_at) return { ok: true as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId })
      .eq("id", data.taskId)
      .eq("status", "requested")
      .eq("source", "client_request")
      .is("deleted_at", null);
    if (error) throw error;
    return { ok: true as const };
  });
