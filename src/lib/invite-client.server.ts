// Server-only helper: sends the client activation email via Resend.
export async function sendActivationEmail(
  email: string,
  name: string | undefined,
  origin: string,
) {
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
    throw new Error(
      `The account was created but the activation email failed to send [${res.status}]`,
    );
  }
}
