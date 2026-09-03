import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SelfLinkResult {
  ok: boolean;
  clientName?: string;
  message?: string;
}

/**
 * Lets a signed-in person claim their own client workspace when their login
 * email matches an onboarded client's email — no staff linking step needed.
 * Only ever grants the "client" role, never staff access.
 */
export const claimMyClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SelfLinkResult> => {
    const email = ((context.claims as { email?: string } | null)?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email) {
      return { ok: false, message: "Your account has no email address to match." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Never let an existing staff account be downgraded/relinked by this flow.
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleList = (roles ?? []).map((r) => r.role as string);
    if (roleList.includes("admin") || roleList.includes("member")) {
      return { ok: false, message: "Staff accounts are not linked to a single client." };
    }

    const { data: client, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, business_name, email")
      .is("archived_at", null)
      .ilike("email", email)
      .maybeSingle();
    if (error) throw error;

    if (!client) {
      return {
        ok: false,
        message:
          "We could not find a client account for this email. Please contact the Helen of Health team.",
      };
    }

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ client_id: client.id })
      .eq("id", context.userId);
    if (pErr) throw pErr;

    if (!roleList.includes("client")) {
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: context.userId, role: "client" });
      if (rErr) throw rErr;
    }

    return { ok: true, clientName: client.business_name || client.name };
  });
