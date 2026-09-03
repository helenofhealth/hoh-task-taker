import { createFileRoute } from "@tanstack/react-router";

// 1x1 transparent GIF used as the email open beacon.
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function recordOpen(token: string) {
  if (!UUID_RE.test(token)) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("record_invite_open", { _token: token });
  } catch (err) {
    console.error("Failed to record invitation open", err);
  }
}

/** Only allow redirecting back to the auth host that issued the invite link. */
function safeRedirect(raw: string | null) {
  if (!raw) return null;
  try {
    const target = new URL(raw);
    const allowed = new URL(process.env["SUPABASE_URL"] ?? "https://invalid.local");
    if (target.protocol !== "https:") return null;
    if (target.host !== allowed.host) return null;
    return target.toString();
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/invite-open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        await recordOpen(token);

        const redirect = safeRedirect(url.searchParams.get("r"));
        if (redirect) {
          return new Response(null, { status: 302, headers: { Location: redirect } });
        }

        return new Response(PIXEL, {
          status: 200,
          headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        });
      },
    },
  },
});
