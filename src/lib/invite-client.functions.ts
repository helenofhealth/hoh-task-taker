import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface InviteClientInput {
  clientId: string;
  email: string;
  name?: string | undefined;
  origin: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const inviteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: InviteClientInput) => {
    const email = input.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) throw new Error("A valid email is required");
    if (!input.clientId) throw new Error("Client is required");
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    return {
      clientId: input.clientId,
      email,
      name: input.name?.trim() || undefined,
      origin: input.origin.replace(/\/+$/, ""),
    };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can invite clients");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const linkUserToClient = async (userId: string) => {
      await supabaseAdmin
        .from("profiles")
        .update({ client_id: data.clientId })
        .eq("id", userId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "client" });
    };

    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.name },
      redirectTo: `${data.origin}/auth`,
    });

    if (error) {
      // The person already has an account — link it to the client instead of inviting.
      if (/already been registered|already exists/i.test(error.message)) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", data.email)
          .maybeSingle();
        if (!profile) throw new Error("This email already has an account that could not be linked");
        await linkUserToClient(profile.id);
        return { ok: true as const, invited: false as const, userId: profile.id };
      }
      throw new Error(error.message);
    }

    const userId = invited.user?.id;
    if (userId) await linkUserToClient(userId);
    if (userId) await sendActivationEmail(data.email, data.name, data.origin);
    return { ok: true as const, invited: true as const, userId };
  });

async function sendActivationEmail(email: string, name: string | undefined, origin: string) {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set; skipping activation email");
    return;
  }
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <h1 style="color: #c2185b; font-size: 22px;">Welcome to your client portal</h1>
      <p>Hi ${name || "there"},</p>
      <p>You've been invited to track your projects, time reports, and deliverables with us. Check your inbox for the sign-in link we just sent, or activate your account here:</p>
      <p style="margin: 28px 0;">
        <a href="${origin}/auth" style="background: #c2185b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Activate your account</a>
      </p>
      <p style="color: #666; font-size: 13px;">If you weren't expecting this invite, you can ignore this email.</p>
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: "Client Portal <onboarding@resend.dev>",
      to: [email],
      subject: "You're invited — activate your client portal account",
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend send failed [${res.status}]: ${body}`);
    throw new Error(`The account was created but the activation email failed to send [${res.status}]`);
  }
}
  });
