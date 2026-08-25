// Server-only helpers for creating in-app notifications.
export const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  in_progress: "In Progress",
  on_hold: "On Hold",
  review: "Review",
  completed: "Completed",
};

// In-app dedup window: a second event of the same kind on the same task
// within this window updates the existing unread notification instead of
// stacking a new one, so quick successive changes stay a single item.
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

export async function createNotifications(
  userIds: string[],
  payload: { taskId: string; kind: string; title: string; body?: string },
) {
  if (userIds.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { data: existing } = await supabaseAdmin
    .from("notifications")
    .select("id, user_id")
    .in("user_id", userIds)
    .eq("task_id", payload.taskId)
    .eq("kind", payload.kind)
    .is("read_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  // Update the newest unread match per user (bump title/body/created_at);
  // insert fresh rows for everyone else.
  const matched = new Map<string, string>();
  for (const n of existing ?? []) {
    if (!matched.has(n.user_id)) matched.set(n.user_id, n.id);
  }
  const insertRows = userIds
    .filter((id) => !matched.has(id))
    .map((user_id) => ({
      user_id,
      task_id: payload.taskId,
      kind: payload.kind,
      title: payload.title,
      body: payload.body ?? null,
    }));
  if (insertRows.length > 0) {
    const { error } = await supabaseAdmin.from("notifications").insert(insertRows);
    if (error) console.error("Failed to create notifications:", error.message);
  }
  for (const notifId of matched.values()) {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ title: payload.title, body: payload.body ?? null, created_at: new Date().toISOString() })
      .eq("id", notifId);
    if (error) console.error("Failed to update notification:", error.message);
  }
}

// Queues an email for the batched flush (every ~2 minutes). Quick successive
// events for the same user + task merge into a single summary email.
export async function queueEmailBatch(
  supabaseAdmin: any,
  userIds: string[],
  payload: { taskId: string; taskTitle: string; category: string; heading: string; line: string; link: string },
) {
  if (userIds.length === 0) return;
  const rows = userIds.map((user_id) => ({
    user_id,
    task_id: payload.taskId,
    task_title: payload.taskTitle,
    category: payload.category,
    heading: payload.heading,
    line: payload.line,
    link: payload.link,
  }));
  const { error } = await supabaseAdmin.from("email_outbox").insert(rows);
  if (error) console.error("Failed to queue email batch:", error.message);
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
// True when the user's local time falls inside their quiet-hours window.
// Windows may wrap midnight (e.g. 22:00–07:00).
function inQuietHours(pref: any): boolean {
  if (!pref?.quiet_enabled || !pref.quiet_start || !pref.quiet_end) return false;
  const tz = typeof pref.quiet_timezone === "string" && pref.quiet_timezone ? pref.quiet_timezone : "Europe/Athens";
  let nowMin: number;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    nowMin = h * 60 + m;
  } catch {
    return false; // unknown timezone — don't suppress
  }
  const toMin = (t: string) => {
    const [hh, mm] = t.split(":");
    return (Number(hh) || 0) * 60 + (Number(mm) || 0);
  };
  const start = toMin(pref.quiet_start);
  const end = toMin(pref.quiet_end);
  if (start === end) return false;
  return start < end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
}

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
  // Comment/status emails are batched into the daily digest for users who
  // opted in; mentions and assignments always send instantly.
  const digestable = category === "comments" || category === "status";
  for (const id of userIds) {
    const pref = prefMap.get(id);
    if (!pref || pref[cols.inapp] !== false) inapp.push(id);
    const digestOn = digestable && pref?.email_digest === true;
    // Quiet hours hold back instant emails only; in-app notifications still land.
    if (!digestOn && !inQuietHours(pref) && (!pref || pref[cols.email] !== false)) email.push(id);
  }
  return { inapp, email };
}
