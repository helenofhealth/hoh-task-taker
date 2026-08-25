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
  commentId: string;
  commentBody: string;
  origin: string;
  mentionIds?: string[];
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
    .select("id, title, status, owner_id, client_id, clients(name)")
    .eq("id", taskId)
    .single();
  if (!task) return null;

  const { data: followers } = await supabaseAdmin
    .from("task_followers")
    .select("user_id")
    .eq("task_id", taskId);

  const { data: owners } = await supabaseAdmin
    .from("task_owners")
    .select("user_id")
    .eq("task_id", taskId);

  const recipientIds = new Set<string>(followers?.map((f: any) => f.user_id) ?? []);
  for (const o of owners ?? []) recipientIds.add(o.user_id);
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
    const base = data.origin.replace(/\/+$/, "");
    const link = `${base}/board?task=${encodeURIComponent(data.taskId)}`;

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
// Users @-mentioned in the comment get a distinct "mentioned you" notification
// and email, even when they are not otherwise following the task.
export const notifyTaskComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NotifyCommentInput) => {
    if (!input.taskId) throw new Error("Task is required");
    const body = input.commentBody?.trim();
    if (!body) throw new Error("Comment is required");
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    const mentionIds = Array.isArray(input.mentionIds)
      ? [...new Set(input.mentionIds.filter((id) => typeof id === "string" && id.length > 0))]
      : [];
    return { ...input, commentBody: body, mentionIds };
  })
  .handler(async ({ data, context }) => {
    const { createNotifications } = await import("./notifications.server");
    const loaded = await loadTaskAndRecipients(context.supabase, context.userId, data.taskId, true);
    if (!loaded) throw new Error("Forbidden");
    const { supabaseAdmin, task, recipientIds, actorName } = loaded;

    const snippet =
      data.commentBody.length > 240 ? `${data.commentBody.slice(0, 240)}…` : data.commentBody;
    const base = data.origin.replace(/\/+$/, "");
    const link = `${base}/board?task=${encodeURIComponent(data.taskId)}&comment=${encodeURIComponent(data.commentId)}`;

    // Only users who may see the task can be mentioned: staff or members of
    // the task's client. Mentioned users already in the regular audience get
    // the mention variant instead of the plain comment notification.
    const candidateIds = (data.mentionIds ?? []).filter((id) => id !== context.userId);
    let mentionIds: string[] = [];
    if (candidateIds.length > 0) {
      const { data: mentionProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, client_id")
        .in("id", candidateIds);
      const { data: staffRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("user_id", candidateIds)
        .in("role", ["admin", "member"]);
      const staffSet = new Set((staffRoles ?? []).map((r: any) => r.user_id));
      const taskClientId = (task as any).client_id ?? null;
      mentionIds = (mentionProfiles ?? [])
        .filter((p: any) => staffSet.has(p.id) || (taskClientId && p.client_id === taskClientId))
        .map((p: any) => p.id);
    }

    const mentionSet = new Set(mentionIds);
    const regularIds = recipientIds.filter((id) => !mentionSet.has(id));

    await createNotifications(regularIds, {
      taskId: task.id,
      kind: "comment",
      title: `New comment on "${task.title}"`,
      body: `${actorName}: ${snippet}`,
    });
    await createNotifications(mentionIds, {
      taskId: task.id,
      kind: "mention",
      title: `${actorName} mentioned you on "${task.title}"`,
      body: snippet,
    });

    const { sendTaskCommentEmail, sendTaskMentionEmail } = await import("./invite-client.server");
    let sent = 0;
    const emails = await recipientEmails(supabaseAdmin, regularIds);
    for (const email of emails) {
      try {
        await sendTaskCommentEmail(email, task.title, actorName, snippet, link);
        sent++;
      } catch (err) {
        console.error("Comment email to recipient failed:", err);
      }
    }
    const mentionEmails = await recipientEmails(supabaseAdmin, mentionIds);
    for (const email of mentionEmails) {
      try {
        await sendTaskMentionEmail(email, task.title, actorName, snippet, link);
        sent++;
      } catch (err) {
        console.error("Mention email to recipient failed:", err);
      }
    }
    return { ok: true as const, sent };
  });

type TaskEventKind = "assigned" | "follower_added" | "created" | "details";

interface NotifyTaskEventInput {
  taskId: string;
  kind: TaskEventKind;
  detail?: string;
  targetUserId?: string;
  origin: string;
}

const EVENT_KINDS: TaskEventKind[] = ["assigned", "follower_added", "created", "details"];

// Notifies about task changes beyond status/comments: a task was created for
// you, you were assigned as owner, you were added as a follower, or task
// details (title, dates, priority) changed.
export const notifyTaskEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NotifyTaskEventInput) => {
    if (!input.taskId) throw new Error("Task is required");
    if (!EVENT_KINDS.includes(input.kind)) throw new Error("Unknown event kind");
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { createNotifications } = await import("./notifications.server");
    const loaded = await loadTaskAndRecipients(context.supabase, context.userId, data.taskId, false);
    if (!loaded) throw new Error("Forbidden");
    const { supabaseAdmin, task, recipientIds, actorName } = loaded;

    // Assignment and follower events notify the affected user; created/details
    // events go to the whole audience (owner + followers) minus the actor.
    let notifyIds: string[];
    if (data.kind === "assigned" || data.kind === "follower_added") {
      const target = data.targetUserId;
      if (!target) throw new Error("Target user is required");
      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", target)
        .maybeSingle();
      if (!targetProfile) return { ok: true as const, sent: 0 };
      notifyIds = target === context.userId ? [] : [target];
    } else {
      notifyIds = recipientIds;
    }

    let title: string;
    let body: string;
    switch (data.kind) {
      case "assigned":
        title = `You were assigned "${task.title}"`;
        body = `${actorName} made you the owner of this task.`;
        break;
      case "follower_added":
        title = `You were added as a follower of "${task.title}"`;
        body = `${actorName} added you to the task's team.`;
        break;
      case "created":
        title = `New task: "${task.title}"`;
        body = data.detail
          ? `${actorName} created this task — ${data.detail}`
          : `${actorName} created this task.`;
        break;
      default:
        title = `"${task.title}" was updated`;
        body = data.detail
          ? `${actorName} updated ${data.detail}.`
          : `${actorName} updated this task.`;
    }

    const base = data.origin.replace(/\/+$/, "");
    const link = `${base}/board?task=${encodeURIComponent(data.taskId)}`;
    await createNotifications(notifyIds, { taskId: task.id, kind: data.kind, title, body });

    const emails = await recipientEmails(supabaseAdmin, notifyIds);
    const { sendTaskUpdateEmail } = await import("./invite-client.server");
    let sent = 0;
    for (const email of emails) {
      try {
        await sendTaskUpdateEmail(email, title, `${body}<br/><strong>${task.title}</strong>`, link);
        sent++;
      } catch (err) {
        console.error("Task update email to recipient failed:", err);
      }
    }
    return { ok: true as const, sent };
  });
