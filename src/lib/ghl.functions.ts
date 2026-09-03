import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface GhlStatus {
  connected: boolean;
  subAccounts: { id: string; ghl_id: string; name: string }[];
  lastSync: string | null;
}

/** Connection status + synced sub-accounts for the settings page. */
export const getGhlStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (!isStaff) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ghl_sub_accounts")
      .select("id, ghl_id, name, synced_at")
      .order("name");
    const rows = data ?? [];
    return {
      connected: !!process.env["GHL_API_KEY"],
      subAccounts: rows.map((r: any) => ({ id: r.id, ghl_id: r.ghl_id, name: r.name })),
      lastSync: rows.length > 0 ? (rows[0] as any).synced_at : null,
    } satisfies GhlStatus;
  });

/** Syncs sub-accounts (locations) from the GHL agency API. Admin only. */
export const syncGhlSubAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can sync GoHighLevel");

    const apiKey = process.env["GHL_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "GoHighLevel is not connected yet — add the GHL_API_KEY secret first.",
      );
    }

    const res = await fetch(
      "https://services.leadconnectorhq.com/locations/search?limit=100",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GoHighLevel returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { locations?: { id: string; name: string }[] };
    const locations = json.locations ?? [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const loc of locations) {
      await supabaseAdmin
        .from("ghl_sub_accounts")
        .upsert(
          { ghl_id: loc.id, name: loc.name, synced_at: new Date().toISOString() },
          { onConflict: "ghl_id" },
        );
    }
    return { ok: true as const, synced: locations.length };
  });
