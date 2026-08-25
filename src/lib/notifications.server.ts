// Server-only helpers for creating in-app notifications.
export const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  in_progress: "In Progress",
  on_hold: "On Hold",
  review: "Review",
  completed: "Completed",
};

export async function createNotifications(
  userIds: string[],
  payload: { taskId: string; kind: string; title: string; body?: string },
) {
  if (userIds.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = userIds.map((user_id) => ({
    user_id,
    task_id: payload.taskId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body ?? null,
  }));
  const { error } = await supabaseAdmin.from("notifications").insert(rows);
  if (error) console.error("Failed to create notifications:", error.message);
}

// Notification categories users can toggle per channel in their preferences.
export type NotifCategory = "comments" | "mentions" | "status" | "assignments";

const PREF_COLUMNS: Record<NotifCategory, { email: string; inapp: string }> = {
  comments: { email: "email_comments", inapp: "inapp_comments" },
  mentions: { email: "email_mentions", inapp: "inapp_mentions" },
  status: { email: "email_status", inapp: "inapp_status" },
  assignments: { email: "email_assignments", inapp: "inapp_assignments" },
};

// Splits recipients into those who want in-app vs email notifications for a
// category. Users with no preferences row get everything (defaults are on).
export async function filterByPrefs(
  supabaseAdmin: any,
  userIds: string[],
  category: NotifCategory,
): Promise<{ inapp: string[]; email: string[] }> {
  if (userIds.length === 0) return { inapp: [], email: [] };
  const { data: prefs } = await supabaseAdmin
    .from("notification_preferences")
    .select("*")
    .in("user_id", userIds);
  const prefMap = new Map<string, any>((prefs ?? []).map((p: any) => [p.user_id, p]));
  const cols = PREF_COLUMNS[category];
  const inapp: string[] = [];
  const email: string[] = [];
  for (const id of userIds) {
    const pref = prefMap.get(id);
    if (!pref || pref[cols.inapp] !== false) inapp.push(id);
    if (!pref || pref[cols.email] !== false) email.push(id);
  }
  return { inapp, email };
}
