import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const NOTIFICATIONS_PAGE_SIZE = 20;

// Strips characters that are meaningful inside PostgREST ilike/or patterns.
function sanitizeSearch(q: string): string {
  return q.replace(/[%_,.()\\"]/g, " ").replace(/\s+/g, " ").trim();
}

interface FetchInput {
  q?: string;
  offset?: number;
}

export const fetchMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: FetchInput | undefined) => ({
    q: sanitizeSearch(typeof input?.q === "string" ? input.q : "").slice(0, 120),
    offset: Math.max(0, Math.min(100000, Math.floor(Number(input?.offset) || 0))),
  }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("notifications")
      .select("id, task_id, kind, title, body, read_at, created_at")
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + NOTIFICATIONS_PAGE_SIZE - 1);
    if (data.q) {
      query = query.or(`title.ilike.%${data.q}%,body.ilike.%${data.q}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const fetchUnreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Notification is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// Bulk mark-read for a specific set (e.g. everything currently shown by the
// active search/filters).
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    const ids = Array.isArray(input.ids)
      ? [...new Set(input.ids.filter((id) => typeof id === "string" && id.length > 0))].slice(0, 500)
      : [];
    if (ids.length === 0) throw new Error("No notifications selected");
    return { ids };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", data.ids)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
