import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface NotifyInput {
  taskId: string;
  oldStatus: string;
  newStatus: string;
  origin: string;
}

interface NotifyCommentInput {
  taskId: string;
  commentBody: string;
  origin: string;
}

// Loads the task and computes recipients: owner + followers (+ commenters for
// comment notifications), excluding the actor. Returns null when the caller
// isn't allowed to see the task.
async function loadTaskAndRecipients(
  supabase: any,
  userId: string,
  taskId: string,
  includeCommenters: boolean,
) {
  const { data: canSee } = await supabase.rpc("can_see_task", { _task_id: taskId });
  if (!canSee) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: task } = await supabaseAdmin
    .from("tasks")
    .select("id, title, status, owner_id, clients(name)")
    .eq("id", taskId)
    .single();
  if (!task) return null;

  const { data: followers } = await supabaseAdmin
    .from("task_followers")
    .select("user_id")
    .eq("task_id", taskId);

  const recipientIds = new Set<string>(followers?.map((f: any) => f.user_id) ?? []);
  if (task.owner_id) recipientIds.add(task.owner_id);

  if (includeCommenters) {
    const { data: comments } = await supabaseAdmin
      .from("task_comments")
      .select("user_id")
      .eq("task_id", taskId);
    for (const c of comments ?? []) recipientIds.add(c.user_id);
  }

  recipientIds.delete(userId); // don't notify the person who made the change

  const { data: actor } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  return {
    supabaseAdmin,
    task,
    recipientIds: [...recipientIds] as string[],
    actorName: actor?.full_name || actor?.email || "A teammate",
    clientName: (task.clients as { name: string } | null)?.name ?? null,
  };
}

async function recipientEmails(supabaseAdmin: any, recipientIds: string[]) {
  if (recipientIds.length === 0) return [] as string[];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .in("id", recipientIds);
  return (profiles ?? []).map((p: any) => p.email).filter((e: unknown): e is string => !!e);
}

// Notifies the task owner and followers when a task changes status.
export const notifyTaskStatusChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NotifyInput) => {
    if (!input.taskId) throw new Error("Task is required");
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { STATUS_LABELS, createNotifications } = await import("./notifications.server");
    if (!STATUS_LABELS[data.newStatus]) throw new Error("Unknown status");

    const loaded = await loadTaskAndRecipients(context.supabase, context.userId, data.taskId, false);
    if (!loaded) throw new Error("Forbidden");
    const { supabaseAdmin, task, recipientIds, actorName, clientName } = loaded;
    if (task.status !== data.newStatus) return { ok: true as const, sent: 0 }; // stale call

    const oldLabel = STATUS_LABELS[data.oldStatus] ?? data.oldStatus;
    const newLabel = STATUS_LABELS[data.newStatus] ?? data.newStatus;
    const link = `${data.origin.replace(/\/+$/, "")}/board`;

    await createNotifications(recipientIds, {
      taskId: task.id,
      kind: "status",
      title: `"${task.title}" moved to ${newLabel}`,
      body: `${actorName} changed the status from ${oldLabel} to ${newLabel}.`,
    });

    const emails = await recipientEmails(supabaseAdmin, recipientIds);
    const { sendTaskStatusEmail } = await import("./invite-client.server");
    let sent = 0;
    for (const email of emails) {
      try {
        await sendTaskStatusEmail(email, task.title, clientName, oldLabel, newLabel, actorName, link);
        sent++;
      } catch (err) {
        console.error("Status email to recipient failed:", err);
      }
    }
    return { ok: true as const, sent };
  });

// Notifies the task owner, followers, and other commenters about a new comment.
export const notifyTaskComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NotifyCommentInput) => {
    if (!input.taskId) throw new Error("Task is required");
    const body = input.commentBody?.trim();
    if (!body) throw new Error("Comment is required");
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    return { ...input, commentBody: body };
  })
  .handler(async ({ data, context }) => {
    const { createNotifications } = await import("./notifications.server");
    const loaded = await loadTaskAndRecipients(context.supabase, context.userId, data.taskId, true);
    if (!loaded) throw new Error("Forbidden");
    const { supabaseAdmin, task, recipientIds, actorName } = loaded;

    const snippet =
      data.commentBody.length > 240 ? `${data.commentBody.slice(0, 240)}…` : data.commentBody;
    const link = `${data.origin.replace(/\/+$/, "")}/board`;

    await createNotifications(recipientIds, {
      taskId: task.id,
      kind: "comment",
      title: `New comment on "${task.title}"`,
      body: `${actorName}: ${snippet}`,
    });

    const emails = await recipientEmails(supabaseAdmin, recipientIds);
    const { sendTaskCommentEmail } = await import("./invite-client.server");
    let sent = 0;
    for (const email of emails) {
      try {
        await sendTaskCommentEmail(email, task.title, actorName, snippet, link);
        sent++;
      } catch (err) {
        console.error("Comment email to recipient failed:", err);
      }
    }
    return { ok: true as const, sent };
  });
