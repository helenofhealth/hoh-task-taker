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

    // generateLink creates the user without sending Supabase's built-in invite
    // email — the invite goes through Resend so it comes from no-reply@tasks.helenofhealth.com.
    const { data: inviteLink, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: data.email,
      options: {
        data: { full_name: data.name },
        redirectTo: `${data.origin}/auth`,
      },
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

    const userId = inviteLink.user?.id;
    if (userId) await linkUserToClient(userId);
    if (userId && inviteLink.properties?.action_link) {
      const { sendActivationEmail } = await import("./invite-client.server");
      await sendActivationEmail(data.email, data.name, inviteLink.properties.action_link);
    }
    return { ok: true as const, invited: true as const, userId };
  });
