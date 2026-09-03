import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently removes an archived (deleted) client and every record that hangs off it.
 * Admin-only and irreversible — tasks, time entries, hour credits, invites and audit
 * rows for that client are all removed.
 */
export const purgeClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string }) => {
    if (!input?.clientId) throw new Error("Client is required");
    return { clientId: input.clientId };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can permanently delete a client");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: client, error: readError } = await supabaseAdmin
      .from("clients")
      .select("id, name, archived_at")
      .eq("id", data.clientId)
      .maybeSingle();
    if (readError) throw readError;
    if (!client) throw new Error("Client not found");
    if (!client.archived_at) {
      throw new Error("Delete the client first, then permanently remove them");
    }

    // Unlink client portal users so their profile survives the purge.
    await supabaseAdmin.from("profiles").update({ client_id: null }).eq("client_id", client.id);

    // Audit tables have no cascade, so clear them explicitly.
    await supabaseAdmin.from("hour_credit_audit").delete().eq("client_id", client.id);
    await supabaseAdmin.from("client_audit").delete().eq("client_id", client.id);

    // Tasks, time entries, hour credits, invites and alerts cascade from these deletes.
    const { error: tasksError } = await supabaseAdmin
      .from("tasks")
      .delete()
      .eq("client_id", client.id);
    if (tasksError) throw tasksError;

    const { error } = await supabaseAdmin.from("clients").delete().eq("id", client.id);
    if (error) throw error;

    return { ok: true as const, name: client.name };
  });
