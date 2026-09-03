import { safeAppOrigin } from "@/lib/app-origin";
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

// Only users who may see the task can be mentioned: staff or members of the
// task's client. Returns the validated subset, deduplicated.
async function resolveMentionIds(
  supabaseAdmin: any,
  candidateIds: string[],
  taskClientId: string | null,
): Promise<string[]> {
  const ids = [...new Set(candidateIds)];
  if (ids.length === 0) return [];
  const { data: mentionProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id, client_id")
    .in("id", ids);
  const { data: staffRoles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("user_id", ids)
    .in("role", ["admin", "member"]);
  const staffSet = new Set((staffRoles ?? []).map((r: any) => r.user_id));
  return (mentionProfiles ?? [])
    .filter((p: any) => staffSet.has(p.id) || (taskClientId && p.client_id === taskClientId))
    .map((p: any) => p.id);
}

// Notifies the task owner and followers when a task changes status.
export const notifyTaskStatusChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NotifyInput) => {
    if (!input.taskId) throw new Error("Task is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { STATUS_LABELS, createNotifications } = await import("./notifications.server");
    if (!STATUS_LABELS[data.newStatus]) throw new Error("Unknown status");

    const loaded = await loadTaskAndRecipients(context.supabase, context.userId, data.taskId, false);
    if (!loaded) throw new Error("Forbidden");
    const { supabaseAdmin, task, recipientIds, actorName } = loaded;
    if (task.status !== data.newStatus) return { ok: true as const, sent: 0 }; // stale call

    const oldLabel = STATUS_LABELS[data.oldStatus] ?? data.oldStatus;
    const newLabel = STATUS_LABELS[data.newStatus] ?? data.newStatus;
    const base = data.origin;
    const link = `${base}/board?task=${encodeURIComponent(data.taskId)}`;

    const { filterByPrefs } = await import("./notifications.server");
    const { inapp, email: emailIds } = await filterByPrefs(supabaseAdmin, recipientIds, "status", { deferQuietHours: true });

    await createNotifications(inapp, {
      taskId: task.id,
      kind: "status",
      title: `"${task.title}" moved to ${newLabel}`,
      body: `${actorName} changed the status from ${oldLabel} to ${newLabel}.`,
    });

    // Queue emails for the batched flush so rapid status flips merge into one
    // summary email instead of one email per change.
    const { queueEmailBatch } = await import("./notifications.server");
    await queueEmailBatch(supabaseAdmin, emailIds, {
      taskId: task.id,
      taskTitle: task.title,
      category: "status",
      heading: `"${task.title}" moved to ${newLabel}`,
      line: `${actorName} changed the status from ${oldLabel} to ${newLabel}.`,
      link,
    });
    return { ok: true as const, sent: emailIds.length };
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
    const base = data.origin;
    const link = `${base}/board?task=${encodeURIComponent(data.taskId)}&comment=${encodeURIComponent(data.commentId)}`;

    // Only users who may see the task can be mentioned: staff or members of
    // the task's client. Mentioned users already in the regular audience get
    // the mention variant instead of the plain comment notification.
    const mentionIds = await resolveMentionIds(
      supabaseAdmin,
      (data.mentionIds ?? []).filter((id) => id !== context.userId),
      (task as any).client_id ?? null,
    );

    const mentionSet = new Set(mentionIds);
    const regularIds = recipientIds.filter((id) => !mentionSet.has(id));

    const { filterByPrefs } = await import("./notifications.server");
    const commentPrefs = await filterByPrefs(supabaseAdmin, regularIds, "comments", { deferQuietHours: true });
    const mentionPrefs = await filterByPrefs(supabaseAdmin, mentionIds, "mentions");

    await createNotifications(commentPrefs.inapp, {
      taskId: task.id,
      kind: "comment",
      title: `New comment on "${task.title}"`,
      body: `${actorName}: ${snippet}`,
      commentId: data.commentId,
    });
    await createNotifications(mentionPrefs.inapp, {
      taskId: task.id,
      kind: "mention",
      title: `${actorName} mentioned you on "${task.title}"`,
      body: snippet,
      commentId: data.commentId,
    });

    const { sendTaskMentionEmail } = await import("./invite-client.server");
    // Regular comment emails go through the batched outbox; mentions stay instant.
    const { queueEmailBatch } = await import("./notifications.server");
    await queueEmailBatch(supabaseAdmin, commentPrefs.email, {
      taskId: task.id,
      taskTitle: task.title,
      category: "comments",
      heading: `New comment on "${task.title}"`,
      line: `${actorName}: ${snippet}`,
      link,
    });
    let sent = commentPrefs.email.length;
    const mentionEmails = await recipientEmails(supabaseAdmin, mentionPrefs.email);
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

    const base = data.origin;
    const link = `${base}/board?task=${encodeURIComponent(data.taskId)}`;

    const { filterByPrefs } = await import("./notifications.server");
    const category = data.kind === "details" ? "status" : "assignments";
    const { inapp, email: emailIds } = await filterByPrefs(supabaseAdmin, notifyIds, category, {
      deferQuietHours: data.kind === "details",
    });

    await createNotifications(inapp, { taskId: task.id, kind: data.kind, title, body });

    if (data.kind === "details") {
      // Detail edits are batched so a flurry of tweaks sends one summary email.
      const { queueEmailBatch } = await import("./notifications.server");
      await queueEmailBatch(supabaseAdmin, emailIds, {
        taskId: task.id,
        taskTitle: task.title,
        category: "status",
        heading: `"${task.title}" was updated`,
        line: body,
        link,
      });
      return { ok: true as const, sent: emailIds.length };
    }

    const emails = await recipientEmails(supabaseAdmin, emailIds);
    const { sendTaskUpdateEmail } = await import("./invite-client.server");
    let sent = 0;
    for (const email of emails) {
      try {
        await sendTaskUpdateEmail(email, title, body, link, task.title);
        sent++;
      } catch (err) {
        console.error("Task update email to recipient failed:", err);
      }
    }
    return { ok: true as const, sent };
  });

interface NotifyCommentEditInput {
  taskId: string;
  commentId: string;
  commentBody: string;
  origin: string;
  mentionIds?: string[];
}

// Syncs mention notifications after a comment is edited: newly mentioned users
// get the full mention notification + email, users no longer mentioned have
// their (unread) mention notification removed, and still-mentioned users get
// their original notification updated in place with the new text.
export const notifyCommentEdited = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NotifyCommentEditInput) => {
    if (!input.taskId || !input.commentId) throw new Error("Task and comment are required");
    const body = input.commentBody?.trim();
    if (!body) throw new Error("Comment is required");
    const mentionIds = Array.isArray(input.mentionIds)
      ? [...new Set(input.mentionIds.filter((id) => typeof id === "string" && id.length > 0))]
      : [];
    return { ...input, commentBody: body, mentionIds };
  })
  .handler(async ({ data, context }) => {
    const { createNotifications, filterByPrefs } = await import("./notifications.server");
    const loaded = await loadTaskAndRecipients(context.supabase, context.userId, data.taskId, true);
    if (!loaded) throw new Error("Forbidden");
    const { supabaseAdmin, task, actorName } = loaded;

    // Only the comment author (or an admin) may rewrite its notifications.
    const { data: comment } = await supabaseAdmin
      .from("task_comments")
      .select("id, user_id")
      .eq("id", data.commentId)
      .maybeSingle();
    if (!comment) return { ok: true as const }; // comment gone — nothing to sync
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (comment.user_id !== context.userId && !isAdmin) throw new Error("Forbidden");

    const mentionIds = await resolveMentionIds(
      supabaseAdmin,
      (data.mentionIds ?? []).filter((id) => id !== context.userId),
      (task as any).client_id ?? null,
    );
    const nowSet = new Set(mentionIds);

    // Existing mention notifications for this comment.
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, read_at")
      .eq("comment_id", data.commentId)
      .eq("kind", "mention");
    const prevByUser = new Map<string, { id: string; read: boolean }>();
    for (const n of existing ?? []) {
      if (!prevByUser.has(n.user_id)) prevByUser.set(n.user_id, { id: n.id, read: !!n.read_at });
    }

    const snippet =
      data.commentBody.length > 240 ? `${data.commentBody.slice(0, 240)}…` : data.commentBody;
    const base = data.origin;
    const link = `${base}/board?task=${encodeURIComponent(data.taskId)}&comment=${encodeURIComponent(data.commentId)}`;
    const title = `${actorName} mentioned you on "${task.title}" (edited)`;

    // Removed mentions: delete their unread mention notification.
    const removedIds = [...prevByUser.keys()].filter((id) => !nowSet.has(id));
    const removedUnread = removedIds
      .map((id) => prevByUser.get(id)!)
      .filter((n) => !n.read)
      .map((n) => n.id);
    if (removedUnread.length > 0) {
      await supabaseAdmin.from("notifications").delete().in("id", removedUnread);
    }

    // Still-mentioned users: update their original notification in place.
    const stillMentioned = mentionIds.filter((id) => prevByUser.has(id));
    for (const id of stillMentioned) {
      await supabaseAdmin
        .from("notifications")
        .update({ title, body: snippet, created_at: new Date().toISOString() })
        .eq("id", prevByUser.get(id)!.id);
    }

    // Newly mentioned users: full mention notification + instant email.
    const newlyMentioned = mentionIds.filter((id) => !prevByUser.has(id));
    const mentionPrefs = await filterByPrefs(supabaseAdmin, newlyMentioned, "mentions");
    await createNotifications(mentionPrefs.inapp, {
      taskId: task.id,
      kind: "mention",
      title,
      body: snippet,
      commentId: data.commentId,
    });
    const { sendTaskMentionEmail } = await import("./invite-client.server");
    const emails = await recipientEmails(supabaseAdmin, mentionPrefs.email);
    let sent = 0;
    for (const email of emails) {
      try {
        await sendTaskMentionEmail(email, task.title, actorName, snippet, link);
        sent++;
      } catch (err) {
        console.error("Mention email to recipient failed:", err);
      }
    }

    // Refresh the snippet on unread regular "comment" notifications for this comment.
    await supabaseAdmin
      .from("notifications")
      .update({ body: `${actorName}: ${snippet}` })
      .eq("comment_id", data.commentId)
      .eq("kind", "comment")
      .is("read_at", null);

    return { ok: true as const, sent };
  });

// Removes notifications tied to a deleted comment so nobody is pointed at
// content that no longer exists. Emails already delivered can't be unsent.
export const notifyCommentDeleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { taskId: string; commentId: string }) => {
    if (!input.taskId || !input.commentId) throw new Error("Task and comment are required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: canSee } = await context.supabase.rpc("can_see_task", { _task_id: data.taskId });
    if (!canSee) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The comment may already be deleted; fall back to the edit audit trail so
    // legitimate post-delete cleanup still works, and verify both that the
    // comment belongs to the supplied task and that the caller authored it
    // (or is an admin) before touching anyone else's notifications.
    let commentTaskId: string | null = null;
    let commentAuthorId: string | null = null;

    const { data: comment } = await supabaseAdmin
      .from("task_comments")
      .select("task_id, user_id")
      .eq("id", data.commentId)
      .maybeSingle();
    if (comment) {
      commentTaskId = comment.task_id;
      commentAuthorId = comment.user_id;
    } else {
      const { data: edit } = await supabaseAdmin
        .from("task_comment_edits")
        .select("edited_by")
        .eq("comment_id", data.commentId)
        .limit(1)
        .maybeSingle();
      if (edit) commentAuthorId = edit.edited_by ?? null;
    }


    if (commentTaskId && commentTaskId !== data.taskId) throw new Error("Forbidden");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (!isAdmin && commentAuthorId && commentAuthorId !== context.userId) {
      throw new Error("Forbidden");
    }

    // Scope the cleanup to notifications for this comment on this task only.
    await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("comment_id", data.commentId)
      .eq("task_id", data.taskId)
      .is("read_at", null);
    return { ok: true as const };
  });

