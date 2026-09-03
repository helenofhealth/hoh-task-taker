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

    // Collect every task belonging to this client so we can strip their dependents.
    const { data: taskRows, error: taskReadError } = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("client_id", client.id);
    if (taskReadError) throw taskReadError;
    const taskIds = (taskRows ?? []).map((t) => t.id);

    if (taskIds.length > 0) {
      // Remove uploaded documents from storage before dropping their metadata rows.
      const { data: attachments } = await supabaseAdmin
        .from("task_attachments")
        .select("file_path")
        .in("task_id", taskIds);
      const paths = (attachments ?? []).map((a) => a.file_path).filter(Boolean);
      if (paths.length > 0) {
        await supabaseAdmin.storage.from("task-files").remove(paths);
      }

      // Comment edits reference comments, so clear them first.
      const { data: comments } = await supabaseAdmin
        .from("task_comments")
        .select("id")
        .in("task_id", taskIds);
      const commentIds = (comments ?? []).map((c) => c.id);
      if (commentIds.length > 0) {
        await supabaseAdmin.from("task_comment_edits").delete().in("comment_id", commentIds);
        await supabaseAdmin.from("notifications").delete().in("comment_id", commentIds);
      }

      await supabaseAdmin.from("time_entry_audit").delete().in("task_id", taskIds);
      await supabaseAdmin.from("time_entries").delete().in("task_id", taskIds);
      await supabaseAdmin.from("task_activity").delete().in("task_id", taskIds);
      await supabaseAdmin.from("task_attachments").delete().in("task_id", taskIds);
      await supabaseAdmin.from("task_comments").delete().in("task_id", taskIds);
      await supabaseAdmin.from("task_owners").delete().in("task_id", taskIds);
      await supabaseAdmin.from("task_followers").delete().in("task_id", taskIds);
      await supabaseAdmin.from("notifications").delete().in("task_id", taskIds);
      await supabaseAdmin.from("email_outbox").delete().in("task_id", taskIds);
    }

    // Client-scoped records: credits, invites, alerts and audit snapshots.
    // Delete the credits first — the audit trigger writes a "removed" row for
    // each one, so the audit table has to be cleared after that fires.
    await supabaseAdmin.from("hour_credits").delete().eq("client_id", client.id);
    await supabaseAdmin.from("hour_credit_audit").delete().eq("client_id", client.id);
    await supabaseAdmin.from("client_invites").delete().eq("client_id", client.id);
    await supabaseAdmin.from("client_hour_alerts").delete().eq("client_id", client.id);
    await supabaseAdmin.from("client_audit").delete().eq("client_id", client.id);
    // Portal onboarding progress is client-specific; drop it so a re-invited
    // user starts fresh instead of inheriting a purged client's checklist.
    await supabaseAdmin.from("client_onboarding").delete().eq("client_id", client.id);

    const { error: tasksError } = await supabaseAdmin
      .from("tasks")
      .delete()
      .eq("client_id", client.id);
    if (tasksError) throw tasksError;

    const { error } = await supabaseAdmin.from("clients").delete().eq("id", client.id);
    if (error) throw error;

    return { ok: true as const, name: client.name, tasksRemoved: taskIds.length };
  });
