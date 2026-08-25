import { createFileRoute } from '@tanstack/react-router'
import { createFileRoute } from "@tanstack/react-start";

// Batched-email flush, invoked by the pg_cron job "email-flush" every 2
// minutes. Quick successive task changes (status, comments, edits) queued in
// email_outbox are merged into a single summary email per user + task.
// Authenticated with the same token as the daily digest.
const BATCH_WINDOW_MS = 90 * 1000;

export const Route = createFileRoute("/api/public/email-flush")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-cron-token") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: valid } = await supabaseAdmin.rpc("verify_digest_cron_token", {
          _token: token,
        } as never);
        if (!valid) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Only flush rows that have sat for the batching window, so events
        // still arriving get merged before anything is sent.
        const readyBefore = new Date(Date.now() - BATCH_WINDOW_MS).toISOString();
        const { data: rows } = await supabaseAdmin
          .from("email_outbox")
          .select("id, user_id, task_id, task_title, heading, line, link, created_at")
          .lte("created_at", readyBefore)
          .order("created_at", { ascending: true })
          .limit(500);

        if (!rows || rows.length === 0) {
          return Response.json({ ok: true, sent: 0, reason: "outbox empty" });
        }

        const userIds = [...new Set(rows.map((r: any) => r.user_id))] as string[];

        // Hold (don't delete) rows for users currently inside quiet hours.
        const { data: prefs } = await supabaseAdmin
          .from("notification_preferences")
          .select("*")
          .in("user_id", userIds);
        const { isInQuietHours } = await import("@/lib/notifications.server");
        const heldUsers = new Set(
          (prefs ?? []).filter((p: any) => isInQuietHours(p)).map((p: any) => p.user_id),
        );

        const flushable = rows.filter((r: any) => !heldUsers.has(r.user_id));
        if (flushable.length === 0) {
          return Response.json({ ok: true, sent: 0, reason: "all recipients in quiet hours" });
        }

        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, email")
          .in("id", userIds);
        const emailById = new Map<string, string>(
          (profiles ?? []).filter((p: any) => p.email).map((p: any) => [p.id, p.email]),
        );

        // Group by user + task so one email summarizes everything on that task.
        const groups = new Map<string, any[]>();
        for (const r of flushable) {
          const key = `${r.user_id}:${r.task_id ?? "none"}`;
          const list = groups.get(key) ?? [];
          list.push(r);
          groups.set(key, list);
        }

        const { sendBatchedUpdatesEmail } = await import("@/lib/invite-client.server");
        let sent = 0;
        const flushedIds: string[] = [];
        for (const group of groups.values()) {
          const first = group[0];
          const email = emailById.get(first.user_id);
          if (!email) {
            // No reachable address — drop the rows rather than retry forever.
            flushedIds.push(...group.map((r: any) => r.id));
            continue;
          }
          const heading =
            group.length === 1
              ? first.heading
              : `${group.length} updates on "${first.task_title}"`;
          try {
            await sendBatchedUpdatesEmail(email, heading, group.map((r: any) => r.line), first.link);
            flushedIds.push(...group.map((r: any) => r.id));
            sent++;
          } catch (err) {
            console.error("Batched email failed:", err);
          }
        }

        if (flushedIds.length > 0) {
          await supabaseAdmin.from("email_outbox").delete().in("id", flushedIds);
        }
        return Response.json({ ok: true, sent, held: heldUsers.size });
      },
    },
  },
});
