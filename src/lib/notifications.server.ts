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
