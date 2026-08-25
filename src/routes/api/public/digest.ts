import { createFileRoute } from "@tanstack/react-router";

// Daily digest endpoint, invoked by the pg_cron job "daily-digest" at
// 06:00 UTC (09:00 Athens) Monday-Friday. Authenticated with a token stored
// in app_private.config, which only service_role can read.
export const Route = createFileRoute("/api/public/digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-cron-token") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: config } = await supabaseAdmin
          .from("config" as never)
          .select("value")
          .eq("key", "digest_cron_token")
          .maybeSingle();
        const expected = (config as { value: string } | null)?.value;
        if (!expected || token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Window (Europe/Athens): on Monday cover since Friday 00:00, otherwise
        // since yesterday 00:00 — so nothing from the weekend is missed and
        // quiet days send nothing.
        const athensNow = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Europe/Athens" }),
        );
        const weekday = athensNow.getDay(); // 0=Sun … 6=Sat
        const start = new Date(athensNow);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (weekday === 1 ? 3 : 1));
        const windowStart = new Date(
          start.toLocaleString("en-US", { timeZone: "Europe/Athens" }),
        );
        // Convert the Athens wall-clock start back to an absolute instant.
        const offsetMs = athensNow.getTime() - new Date().getTime();
        const since = new Date(windowStart.getTime() - offsetMs).toISOString();

        const windowLabel =
          weekday === 1 ? "over the weekend (Fri–Sun)" : "yesterday";

        // Users opted into the digest.
        const { data: digestPrefs } = await supabaseAdmin
          .from("notification_preferences")
          .select("user_id")
          .eq("email_digest", true);
        const digestUsers = new Set((digestPrefs ?? []).map((p: any) => p.user_id));
        if (digestUsers.size === 0) {
          return Response.json({ ok: true, sent: 0, reason: "no digest subscribers" });
        }

        // Comment + status notifications created inside the window.
        const { data: notes } = await supabaseAdmin
          .from("notifications")
          .select("user_id, kind, title, body, created_at")
          .in("kind", ["comment", "status", "details"])
          .gte("created_at", since)
          .order("created_at", { ascending: true });

        const perUser = new Map<string, any[]>();
        for (const n of notes ?? []) {
          if (!digestUsers.has(n.user_id)) continue;
          const list = perUser.get(n.user_id) ?? [];
          list.push(n);
          perUser.set(n.user_id, list);
        }
        if (perUser.size === 0) {
          return Response.json({ ok: true, sent: 0, reason: "no activity in window" });
        }

        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, email")
          .in("id", [...perUser.keys()]);

        const { sendDailyDigestEmail } = await import("@/lib/invite-client.server");
        const boardLink = "https://tasks.helenofhealth.com/board";

        let sent = 0;
        for (const p of profiles ?? []) {
          if (!p.email) continue;
          try {
            await sendDailyDigestEmail(p.email, perUser.get(p.id) ?? [], windowLabel, boardLink);
            sent++;
          } catch (err) {
            console.error("Digest email failed:", err);
          }
        }
        return Response.json({ ok: true, sent });
      },
    },
  },
});
