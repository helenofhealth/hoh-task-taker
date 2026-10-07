import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

// Called once a day by the database scheduler. Requires the shared cron secret.
export const Route = createFileRoute("/api/public/cron/drive-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        const given = request.headers.get("x-cron-secret") ?? "";
        if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runDailyDriveSync } = await import("@/lib/google-drive.functions");
        const result = await runDailyDriveSync();
        return Response.json(result);
      },
    },
  },
});
