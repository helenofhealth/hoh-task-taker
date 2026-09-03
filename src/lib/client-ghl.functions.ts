import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ClientGhlStatus {
  /** Whether this client has their own agency connected. */
  connected: boolean;
  agencyName: string | null;
  locationId: string | null;
  connectedAt: string | null;
  /** The client this status belongs to (null when the user has no client link). */
  clientId: string | null;
}

/** Resolves which client the caller may manage, and whether they are staff. */
async function resolveClient(
  context: { supabase: any; userId: string },
  requestedClientId?: string | null,
): Promise<{ clientId: string | null; isStaff: boolean }> {
  const { data: isStaff } = await context.supabase.rpc("is_staff", {
    _user_id: context.userId,
  });
  if (isStaff) {
    return { clientId: requestedClientId ?? null, isStaff: true };
  }
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("client_id")
    .eq("id", context.userId)
    .maybeSingle();
  const own = profile?.client_id ?? null;
  if (requestedClientId && requestedClientId !== own) {
    throw new Error("Not authorized for this client");
  }
  return { clientId: own, isStaff: false };
}

/** Whether the signed-in client (or a staff-selected client) has their own agency connected. */
export const getClientGhlStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { clientId?: string | null }) => ({
    clientId: input?.clientId ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { clientId } = await resolveClient(context as any, data.clientId);
    if (!clientId) {
      return {
        connected: false,
        agencyName: null,
        locationId: null,
        connectedAt: null,
        clientId: null,
      } satisfies ClientGhlStatus;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("client_ghl_connections")
      .select("agency_name, location_id, created_at")
      .eq("client_id", clientId)
      .maybeSingle();

    return {
      connected: !!row,
      agencyName: row?.agency_name ?? null,
      locationId: row?.location_id ?? null,
      connectedAt: row?.created_at ?? null,
      clientId,
    } satisfies ClientGhlStatus;
  });

/**
 * Saves a client's own GoHighLevel agency API key after verifying it works.
 * The key is stored server-side only and is never returned to the browser.
 */
export const connectClientGhl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { apiKey: string; locationId?: string; clientId?: string | null }) => {
    const apiKey = (input?.apiKey ?? "").trim();
    if (apiKey.length < 20) throw new Error("Enter your agency API key");
    return {
      apiKey,
      locationId: (input.locationId ?? "").trim() || null,
      clientId: input.clientId ?? null,
    };
  })
  .handler(async ({ data, context }) => {
    const { clientId } = await resolveClient(context as any, data.clientId);
    if (!clientId) throw new Error("Your account isn't linked to a client yet");

    // Verify the key against GoHighLevel before storing it.
    const res = await fetch("https://services.leadconnectorhq.com/locations/search?limit=1", {
      headers: {
        Authorization: `Bearer ${data.apiKey}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`GHL key verification failed [${res.status}]: ${text.slice(0, 300)}`);
      throw new Error(
        res.status === 401 || res.status === 403
          ? "GoHighLevel rejected that API key. Copy the agency-level key and try again."
          : `GoHighLevel returned ${res.status}. Please try again.`,
      );
    }
    const json = (await res.json()) as { locations?: { id: string; name: string }[] };
    const first = json.locations?.[0] ?? null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("client_ghl_connections").upsert(
      {
        client_id: clientId,
        api_key: data.apiKey,
        location_id: data.locationId ?? first?.id ?? null,
        agency_name: first?.name ?? null,
        connected_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    );
    if (error) throw error;

    return { ok: true as const, agencyName: first?.name ?? null };
  });

/** Removes a client's own agency connection. */
export const disconnectClientGhl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { clientId?: string | null }) => ({
    clientId: input?.clientId ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { clientId } = await resolveClient(context as any, data.clientId);
    if (!clientId) throw new Error("Your account isn't linked to a client yet");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("client_ghl_connections")
      .delete()
      .eq("client_id", clientId);
    if (error) throw error;
    return { ok: true as const };
  });
