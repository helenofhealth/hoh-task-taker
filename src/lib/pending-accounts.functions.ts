import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PendingAccount {
  userId: string;
  name: string;
  email: string;
  provider: string;
  createdAt: string;
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Only admins can manage account access");
}

/** Accounts that signed up (usually via Google) but have no role yet. */
export const listPendingAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingAccount[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: rErr } = await supabaseAdmin.from("user_roles").select("user_id");
    if (rErr) throw rErr;
    const withRole = new Set((roles ?? []).map((r) => r.user_id));

    const { data: list, error: uErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (uErr) throw new Error(uErr.message);

    return (list.users ?? [])
      .filter((u) => !withRole.has(u.id))
      .map((u) => ({
        userId: u.id,
        name:
          (u.user_metadata?.["full_name"] as string | undefined) ||
          (u.user_metadata?.["name"] as string | undefined) ||
          u.email ||
          "Unnamed",
        email: u.email ?? "",
        provider: (u.app_metadata?.["provider"] as string | undefined) ?? "email",
        createdAt: u.created_at,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

interface AssignRoleInput {
  userId: string;
  role: "admin" | "member" | "client";
  clientId?: string | undefined;
  hourlyRate?: number | undefined;
}

/** Grant a role to an account and, for clients, link it to a client workspace. */
export const assignAccountRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AssignRoleInput) => {
    if (!input?.userId) throw new Error("Account is required");
    if (input.role !== "admin" && input.role !== "member" && input.role !== "client")
      throw new Error("Invalid role");
    if (input.role === "client" && !input.clientId) throw new Error("Pick a client to link");
    if (input.hourlyRate != null && (isNaN(input.hourlyRate) || input.hourlyRate < 0))
      throw new Error("Hourly rate must be a positive number");
    return {
      userId: input.userId,
      role: input.role,
      clientId: input.role === "client" ? input.clientId! : undefined,
      hourlyRate: input.hourlyRate ?? 0,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (rErr) throw rErr;

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ client_id: data.clientId ?? null })
      .eq("id", data.userId);
    if (pErr) throw pErr;

    if (data.role !== "client") {
      const { error: mErr } = await supabaseAdmin
        .from("member_rates")
        .upsert({ user_id: data.userId, hourly_rate: data.hourlyRate });
      if (mErr) throw mErr;
    } else {
      await supabaseAdmin.from("member_rates").delete().eq("user_id", data.userId);
    }

    return { ok: true as const };
  });
