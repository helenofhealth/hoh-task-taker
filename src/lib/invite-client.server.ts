// Server-only helper: sends the client activation email via the Resend connector.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export async function sendActivationEmail(
  email: string,
  name: string | undefined,
  origin: string,
) {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const resendApiKey = process.env["RESEND_API_KEY"];
  if (!lovableApiKey || !resendApiKey) {
    console.warn("Resend connector not configured; skipping activation email");
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
  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": resendApiKey,
    },
    body: JSON.stringify({
      from: "Helen of Health Task Taker <noreply@tasks.helenofhealth.com>",
      to: [email],
      subject: "You're invited — activate your client portal account",
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend send failed [${res.status}]: ${body}`);
    throw new Error(
      `The account was created but the activation email failed to send [${res.status}]: ${body}`,
    );
  }
}
