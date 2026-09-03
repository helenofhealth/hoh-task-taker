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

    // Every onboarding sends one activation email; the tracking row lets staff see opens.
    const sendActivation = async (actionLink: string) => {
      const { data: invite } = await supabaseAdmin
        .from("client_invites")
        .insert({ client_id: data.clientId, email: data.email })
        .select("token")
        .single();

      const tracking = invite?.token
        ? {
            pixelUrl: `${data.origin}/api/public/invite-open?t=${invite.token}`,
            clickUrl: `${data.origin}/api/public/invite-open?t=${invite.token}&r=${encodeURIComponent(actionLink)}`,
          }
        : undefined;

      const { sendActivationEmail } = await import("./invite-client.server");
      await sendActivationEmail(data.email, data.name, actionLink, tracking);
    };

    // generateLink creates the user without sending Supabase's built-in invite
    // email — the invite goes through Resend so it comes from no-reply@tasks.helenofhealth.com.
    const { data: inviteLink, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: data.email,
      options: {
        data: { full_name: data.name },
        redirectTo: `${data.origin}/reset-password`,
      },
    });

    if (error) {
      // The person already has an account — link it and send a set-password link instead.
      if (/already been registered|already exists/i.test(error.message)) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", data.email)
          .maybeSingle();
        if (!profile) throw new Error("This email already has an account that could not be linked");
        await linkUserToClient(profile.id);

        const { data: recovery } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: data.email,
          options: { redirectTo: `${data.origin}/reset-password` },
        });
        const recoveryLink = recovery?.properties?.action_link;
        if (recoveryLink) await sendActivation(recoveryLink);
        return {
          ok: true as const,
          invited: false as const,
          emailSent: Boolean(recoveryLink),
          userId: profile.id,
        };
      }
      throw new Error(error.message);
    }

    const userId = inviteLink.user?.id;
    if (userId) await linkUserToClient(userId);
    const actionLink = inviteLink.properties?.action_link;
    if (actionLink) await sendActivation(actionLink);
    return { ok: true as const, invited: true as const, emailSent: Boolean(actionLink), userId };
  });
