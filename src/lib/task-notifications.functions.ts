import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  in_progress: "In Progress",
  on_hold: "On Hold",
  review: "Review",
  completed: "Completed",
};

interface NotifyInput {
  taskId: string;
  oldStatus: string;
  newStatus: string;
  origin: string;
}

// Notifies the task owner and followers when a task changes status.
// The person who made the change is excluded from recipients.
export const notifyTaskStatusChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NotifyInput) => {
    if (!input.taskId) throw new Error("Task is required");
    if (!STATUS_LABELS[input.newStatus]) throw new Error("Unknown status");
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    return input;
  })
  .handler(async ({ data, context }) => {
    // RLS: only users who can see the task may trigger notifications for it.
    const { data: canSee } = await context.supabase.rpc("can_see_task", {
      _task_id: data.taskId,
    });
    if (!canSee) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id, title, status, owner_id, clients(name)")
      .eq("id", data.taskId)
      .single();
    if (!task) return { ok: true as const, sent: 0 };
    if (task.status !== data.newStatus) return { ok: true as const, sent: 0 }; // stale call

    const { data: followers } = await supabaseAdmin
      .from("task_followers")
      .select("user_id")
      .eq("task_id", data.taskId);

    const recipientIds = new Set<string>(followers?.map((f) => f.user_id) ?? []);
    if (task.owner_id) recipientIds.add(task.owner_id);
    recipientIds.delete(context.userId); // don't email the person who made the change
    if (recipientIds.size === 0) return { ok: true as const, sent: 0 };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("id", [...recipientIds]);
    const emails = (profiles ?? []).map((p) => p.email).filter((e): e is string => !!e);
    if (emails.length === 0) return { ok: true as const, sent: 0 };

    const { data: actor } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const actorName = actor?.full_name || actor?.email || "A teammate";

    const clientName = (task.clients as { name: string } | null)?.name ?? null;
    const link = `${data.origin.replace(/\/+$/, "")}/board`;

    const { sendTaskStatusEmail } = await import("./invite-client.server");
    let sent = 0;
    for (const email of emails) {
      try {
        await sendTaskStatusEmail(
          email,
          task.title,
          clientName,
          STATUS_LABELS[data.oldStatus] ?? data.oldStatus,
          STATUS_LABELS[data.newStatus] ?? data.newStatus,
          actorName,
          link,
        );
        sent++;
      } catch (err) {
        console.error(`Status email to recipient failed:`, err);
      }
    }
    return { ok: true as const, sent };
  });
