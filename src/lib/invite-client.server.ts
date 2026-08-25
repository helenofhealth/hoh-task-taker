// Server-only helper: sends outbound emails via the Resend connector gateway.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM = "Helen of Health Task Taker <no-reply@tasks.helenofhealth.com>";

async function sendEmail(to: string, subject: string, html: string) {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const resendApiKey = process.env["RESEND_API_KEY"];
  if (!lovableApiKey || !resendApiKey) {
    console.warn("Resend connector not configured; skipping email");
    return;
  }
  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": resendApiKey,
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend send failed [${res.status}]: ${body}`);
    throw new Error(`The email failed to send [${res.status}]: ${body}`);
  }
}

function shell(title: string, body: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <h1 style="color: #c2185b; font-size: 22px;">${title}</h1>
      ${body}
    </div>`;
}

export async function sendActivationEmail(
  email: string,
  name: string | undefined,
  origin: string,
) {
  const html = shell(
    "Welcome to your client portal",
    `<p>Hi ${name || "there"},</p>
     <p>You've been invited to track your projects, time reports, and deliverables with us. Check your inbox for the sign-in link we just sent, or activate your account here:</p>
     <p style="margin: 28px 0;">
       <a href="${origin}/auth" style="background: #c2185b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Activate your account</a>
     </p>
     <p style="color: #666; font-size: 13px;">If you weren't expecting this invite, you can ignore this email.</p>`,
  );
  await sendEmail(email, "You're invited — activate your client portal account", html);
}

export async function sendPasswordResetEmail(email: string, link: string) {
  const html = shell(
    "Reset your password",
    `<p>Hi there,</p>
     <p>We received a request to reset the password for your Helen of Health Task Taker account. Click below to choose a new password — the link expires in one hour.</p>
     <p style="margin: 28px 0;">
       <a href="${link}" style="background: #c2185b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Reset my password</a>
     </p>
     <p style="color: #666; font-size: 13px;">If you didn't request this, you can safely ignore this email — your password stays unchanged.</p>`,
  );
  await sendEmail(email, "Reset your Helen of Health Task Taker password", html);
}
