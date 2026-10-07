import { createFileRoute } from "@tanstack/react-router";

// Called once a day by the database scheduler. Requires the scheduler's stored token.
export const Route = createFileRoute("/api/public/cron/drive-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const given = request.headers.get("x-cron-secret") ?? "";
        if (!given) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ok } = await supabaseAdmin.rpc("verify_cron_token", { _name: "drive_sync", _token: given });
        if (!ok) return new Response("Unauthorized", { status: 401 });
        const { runDailyDriveSync } = await import("@/lib/google-drive.functions");
        const result = await runDailyDriveSync();
        return Response.json(result);
      },
    },
  },
});
