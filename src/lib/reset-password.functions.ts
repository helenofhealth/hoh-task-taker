import { safeAppOrigin } from "@/lib/app-origin";
import { createServerFn } from "@tanstack/react-start";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ResetInput {
  email: string;
  origin: string;
}

/**
 * Public endpoint: emails a password-reset link through Resend.
 * Always resolves { ok: true } so it never reveals whether an account exists.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: ResetInput) => {
    const email = input.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) throw new Error("A valid email is required");
    return { email, origin: safeAppOrigin(input.origin) };
  })
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: data.email,
        options: { redirectTo: `${data.origin}/reset-password` },
      });
      if (error || !link?.properties?.action_link) {
        console.warn("Password reset link not generated", error?.message);
        return { ok: true as const };
      }
      const { sendPasswordResetEmail } = await import("./invite-client.server");
      await sendPasswordResetEmail(data.email, link.properties.action_link);
    } catch (err) {
      console.error("Password reset failed", err);
    }
    return { ok: true as const };
  });
