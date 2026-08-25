// Server-only helper: sends outbound emails via the Resend connector gateway.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM = "Helen of Health Task Taker <no-reply@tasks.helenofhealth.com>";
const APP_NAME = "Helen of Health Task Taker";
// Absolute logo URL so email clients can render it (matches the app logo asset).
const LOGO_URL =
  "https://tasks.helenofhealth.com/__l5e/assets-v1/47b82122-da18-4ab3-bc46-69a7ae63330e/wire.png";

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
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
        <tr>
          <td style="vertical-align: middle;">
            <img src="${LOGO_URL}" alt="${APP_NAME} logo" width="40" height="40" style="display: block; border-radius: 10px;" />
          </td>
          <td style="vertical-align: middle; padding-left: 12px; font-size: 17px; font-weight: bold; color: #c2185b;">
            ${APP_NAME}
          </td>
        </tr>
      </table>
      <h1 style="color: #c2185b; font-size: 22px; margin-top: 0;">${title}</h1>
      ${body}
      <p style="color: #999; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        Sent by ${APP_NAME} &middot; no-reply@tasks.helenofhealth.com
      </p>
    </div>`;
}

export async function sendActivationEmail(
  email: string,
  name: string | undefined,
  link: string,
) {
  const html = shell(
    "Welcome to your client portal",
    `<p>Hi ${name || "there"},</p>
     <p>You've been invited to track your projects, time reports, and deliverables with us. Activate your account and set your password here:</p>
     <p style="margin: 28px 0;">
       <a href="${link}" style="background: #c2185b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Activate your account</a>
     </p>
     <p style="color: #666; font-size: 13px;">If you weren't expecting this invite, you can ignore this email.</p>`,
  );
  await sendEmail(email, "You're invited — activate your client portal account", html);
}

export async function sendTaskStatusEmail(
  email: string,
  taskTitle: string,
  clientName: string | null,
  oldStatusLabel: string,
  newStatusLabel: string,
  changedByName: string,
  link: string,
) {
  const html = shell(
    `Task update: ${taskTitle}`,
    `<p>Hi there,</p>
     <p><strong>${changedByName}</strong> moved a task${clientName ? ` for <strong>${clientName}</strong>` : ""} from <strong>${oldStatusLabel}</strong> to <strong>${newStatusLabel}</strong>:</p>
     <div style="background: #fdf2f6; border: 1px solid #f5d3e0; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
       <p style="margin: 0; font-weight: bold; color: #4a1d33;">${taskTitle}</p>
       <p style="margin: 6px 0 0; color: #8a4a68; font-size: 13px;">${oldStatusLabel} &rarr; <strong>${newStatusLabel}</strong></p>
     </div>
     <p style="margin: 28px 0;">
       <a href="${link}" style="background: #c2185b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">View task</a>
     </p>`,
  );
  await sendEmail(email, `Task "${taskTitle}" is now ${newStatusLabel}`, html);
}

export async function sendTaskCommentEmail(
  email: string,
  taskTitle: string,
  commenterName: string,
  commentBody: string,
  link: string,
) {
  const html = shell(
    `New comment on: ${taskTitle}`,
    `<p>Hi there,</p>
     <p><strong>${commenterName}</strong> left a comment on a task you follow:</p>
     <div style="background: #fdf2f6; border: 1px solid #f5d3e0; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
       <p style="margin: 0; font-weight: bold; color: #4a1d33;">${taskTitle}</p>
       <p style="margin: 8px 0 0; color: #555; font-size: 14px;">${commentBody}</p>
     </div>
     <p style="margin: 28px 0;">
       <a href="${link}" style="background: #c2185b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Reply in the portal</a>
     </p>`,
  );
  await sendEmail(email, `New comment on "${taskTitle}"`, html);
}

export async function sendTaskMentionEmail(
  email: string,
  taskTitle: string,
  mentionerName: string,
  commentBody: string,
  link: string,
) {
  const html = shell(
    `You were mentioned on: ${taskTitle}`,
    `<p>Hi there,</p>
     <p><strong>${mentionerName}</strong> mentioned you in a comment on a task:</p>
     <div style="background: #fdf2f6; border: 1px solid #f5d3e0; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
       <p style="margin: 0; font-weight: bold; color: #4a1d33;">${taskTitle}</p>
       <p style="margin: 8px 0 0; color: #555; font-size: 14px;">${commentBody}</p>
     </div>
     <p style="margin: 28px 0;">
       <a href="${link}" style="background: #c2185b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Reply in the portal</a>
     </p>`,
  );
  await sendEmail(email, `${mentionerName} mentioned you on "${taskTitle}"`, html);
}

export async function sendTaskUpdateEmail(
  email: string,
  heading: string,
  detail: string,
  link: string,
) {
  const html = shell(
    heading,
    `<p>Hi there,</p>
     <div style="background: #fdf2f6; border: 1px solid #f5d3e0; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
       <p style="margin: 0; color: #4a1d33; font-size: 14px;">${detail}</p>
     </div>
     <p style="margin: 28px 0;">
       <a href="${link}" style="background: #c2185b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">View task</a>
     </p>`,
  );
  await sendEmail(email, heading, html);
}

// Batched update email: one message summarizing several quick changes on a task.
export async function sendBatchedUpdatesEmail(
  email: string,
  heading: string,
  lines: string[],
  link: string,
) {
  const items = lines
    .map(
      (l) =>
        `<div style="border-bottom:1px solid #f0e0e8;padding:10px 0;"><p style="margin:0;font-size:14px;color:#4a1d33;">${l}</p></div>`,
    )
    .join("");
  const html = shell(
    heading,
    `<p>Hi there,</p>
     <div style="background: #fdf2f6; border: 1px solid #f5d3e0; border-radius: 10px; padding: 8px 20px; margin: 20px 0;">
       ${items}
     </div>
     <p style="margin: 28px 0;">
       <a href="${link}" style="background: #c2185b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">View task</a>
     </p>
     <p style="color: #666; font-size: 13px;">Quick changes are grouped into one email so your inbox stays tidy.</p>`,
  );
  await sendEmail(email, heading, html);
}

export interface DigestItem {
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
}

export async function sendDailyDigestEmail(
  email: string,
  items: DigestItem[],
  windowLabel: string,
  link: string,
) {
  const rows = items
    .map((n) => {
      const badge =
        n.kind === "status" || n.kind === "details"
          ? '<span style="display:inline-block;background:#f5d3e0;color:#8a4a68;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:999px;margin-right:8px;">STATUS</span>'
          : '<span style="display:inline-block;background:#e3f2fd;color:#1565c0;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:999px;margin-right:8px;">COMMENT</span>';
      return `<div style="border-bottom:1px solid #f0e0e8;padding:12px 0;">
        <p style="margin:0;font-size:14px;">${badge}<strong>${n.title}</strong></p>
        ${n.body ? `<p style="margin:6px 0 0;color:#555;font-size:13px;">${n.body}</p>` : ""}
      </div>`;
    })
    .join("");

  const html = shell(
    "Your daily task digest",
    `<p>Hi there,</p>
     <p>Here's what happened on your tasks <strong>${windowLabel}</strong> — ${items.length} update${items.length === 1 ? "" : "s"}:</p>
     <div style="background: #fdf2f6; border: 1px solid #f5d3e0; border-radius: 10px; padding: 8px 20px; margin: 20px 0;">
       ${rows}
     </div>
     <p style="margin: 28px 0;">
       <a href="${link}" style="background: #c2185b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Open your board</a>
     </p>
     <p style="color: #666; font-size: 13px;">You're receiving one daily summary because you enabled the daily digest in Settings. Turn it off anytime to get instant emails again.</p>`,
  );
  await sendEmail(email, `Daily digest: ${items.length} task update${items.length === 1 ? "" : "s"}`, html);
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
