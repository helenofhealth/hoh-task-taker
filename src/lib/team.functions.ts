import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: "admin" | "member";
  hourlyRate: number | null; // only populated for admins
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Only admins can manage team members");
}

export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamMember[]> => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const isAdmin = !!roles;

    const { data: staffRows, error } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "member"]);
    if (error) throw error;

    const ids = (staffRows ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];

    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", ids);
    if (pErr) throw error;

    let rates: { user_id: string; hourly_rate: number }[] = [];
    if (isAdmin) {
      const { data: r } = await supabase
        .from("member_rates")
        .select("user_id, hourly_rate")
        .in("user_id", ids);
      rates = r ?? [];
    }

    const roleByUser = new Map<string, "admin" | "member">();
    for (const r of staffRows ?? []) roleByUser.set(r.user_id, r.role as "admin" | "member");
    const rateByUser = new Map(rates.map((r) => [r.user_id, r.hourly_rate]));

    return (profiles ?? [])
      .map((p) => ({
        userId: p.id,
        name: p.full_name || p.email || "Unnamed",
        email: p.email ?? "",
        phone: p.phone ?? null,
        role: roleByUser.get(p.id) ?? "member",
        hourlyRate: isAdmin ? (rateByUser.get(p.id) ?? 0) : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

interface InviteTeamMemberInput {
  name: string;
  email: string;
  phone?: string | undefined;
  role: "admin" | "member";
  hourlyRate?: number | undefined;
  origin: string;
}

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: InviteTeamMemberInput) => {
    const email = input.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) throw new Error("A valid email is required");
    if (!input.name?.trim()) throw new Error("Name is required");
    if (input.role !== "admin" && input.role !== "member") throw new Error("Invalid role");
    if (input.hourlyRate != null && (isNaN(input.hourlyRate) || input.hourlyRate < 0))
      throw new Error("Hourly rate must be a positive number");
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    return {
      name: input.name.trim(),
      email,
      phone: input.phone?.trim() || undefined,
      role: input.role,
      hourlyRate: input.hourlyRate ?? 0,
      origin: input.origin.replace(/\/+$/, ""),
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const linkUser = async (userId: string) => {
      await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.name, phone: data.phone ?? null })
        .eq("id", userId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
      await supabaseAdmin
        .from("member_rates")
        .upsert({ user_id: userId, hourly_rate: data.hourlyRate });
    };

    const { data: inviteLink, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: data.email,
      options: { data: { full_name: data.name }, redirectTo: `${data.origin}/auth` },
    });

    if (error) {
      if (/already been registered|already exists/i.test(error.message)) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", data.email)
          .maybeSingle();
        if (!profile) throw new Error("This email already has an account that could not be linked");
        await linkUser(profile.id);
        return { ok: true as const, invited: false as const };
      }
      throw new Error(error.message);
    }

    const userId = inviteLink.user?.id;
    if (userId) await linkUser(userId);
    if (userId && inviteLink.properties?.action_link) {
      const { sendActivationEmail } = await import("./invite-client.server");
      await sendActivationEmail(data.email, data.name, inviteLink.properties.action_link);
    }
    return { ok: true as const, invited: true as const };
  });

interface UpdateTeamMemberInput {
  userId: string;
  name: string;
  phone?: string | undefined;
  role: "admin" | "member";
  hourlyRate?: number | undefined;
}

export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateTeamMemberInput) => {
    if (!input.userId) throw new Error("Member is required");
    if (!input.name?.trim()) throw new Error("Name is required");
    if (input.role !== "admin" && input.role !== "member") throw new Error("Invalid role");
    if (input.hourlyRate != null && (isNaN(input.hourlyRate) || input.hourlyRate < 0))
      throw new Error("Hourly rate must be a positive number");
    return {
      userId: input.userId,
      name: input.name.trim(),
      phone: input.phone?.trim() || undefined,
      role: input.role,
      hourlyRate: input.hourlyRate ?? 0,
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.name, phone: data.phone ?? null })
      .eq("id", data.userId);
    if (pErr) throw pErr;

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (rErr) throw rErr;

    const { error: mErr } = await supabaseAdmin
      .from("member_rates")
      .upsert({ user_id: data.userId, hourly_rate: data.hourlyRate });
    if (mErr) throw mErr;

    return { ok: true as const };
  });
