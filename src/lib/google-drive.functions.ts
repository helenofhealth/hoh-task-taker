import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR = "google_drive";
const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

async function loadKey(userId: string) {
  const { getConnectionKeyForUser } = await import("./app-user-connections.server");
  return getConnectionKeyForUser(userId, CONNECTOR);
}

export const driveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ connected: Boolean(await loadKey(context.userId)) }));

export const startDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env['GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY'];
    if (!clientKey) throw new Error("Google Drive is not configured yet.");
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/oauth/google-drive/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const existing = await loadKey(context.userId);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: SCOPES },
    });
    return { authorizationUrl };
  });

export const completeDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("./app-user-connections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (connectorId !== CONNECTOR) throw new Error("OAuth completion returned the wrong connector");
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

export const disconnectDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = await loadKey(context.userId);
    if (key) {
      const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
      await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: CONNECTOR }).catch(
        (e) => console.error(e),
      );
      const { deleteConnectionForUser } = await import("./app-user-connections.server");
      await deleteConnectionForUser(context.userId, CONNECTOR);
    }
    return { ok: true };
  });

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
};

async function driveGet(key: string, path: string) {
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId: CONNECTOR,
    path,
    requiredScopes: SCOPES,
  });
  if (await appUserReconnectRequired(res)) return { reconnectRequired: true as const };
  if (!res.ok) {
    const body = await res.text();
    console.error(`Drive request failed [${res.status}]: ${body}`);
    throw new Error(`Google Drive request failed [${res.status}]`);
  }
  return { json: (await res.json()) as unknown };
}

export const searchDriveFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().max(200).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const key = await loadKey(context.userId);
    if (!key) return { connected: false, files: [] as DriveFile[] };
    const term = data.query.trim().replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q = `trashed = false and mimeType != 'application/vnd.google-apps.folder'${term ? ` and name contains '${term}'` : ""}`;
    const params = new URLSearchParams({
      q,
      pageSize: "30",
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,size,webViewLink,iconLink,modifiedTime)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    const r = await driveGet(key, `/drive/v3/files?${params}`);
    if ("reconnectRequired" in r) return { connected: false, reconnectRequired: true, files: [] as DriveFile[] };
    return { connected: true, files: ((r.json as { files?: DriveFile[] }).files ?? []) };
  });

export const attachDriveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ taskId: z.string().uuid(), fileId: z.string().regex(/^[\w-]{5,200}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = await loadKey(context.userId);
    if (!key) throw new Error("Connect Google Drive first.");
    const r = await driveGet(
      key,
      `/drive/v3/files/${data.fileId}?fields=id,name,mimeType,size,webViewLink&supportsAllDrives=true`,
    );
    if ("reconnectRequired" in r) throw new Error("Your Google Drive access needs to be renewed. Reconnect and try again.");
    const f = r.json as DriveFile;
    const link = f.webViewLink && /^https:\/\/(docs|drive)\.google\.com\//.test(f.webViewLink)
      ? f.webViewLink
      : `https://drive.google.com/file/d/${f.id}/view`;
    const { error } = await context.supabase.from("task_attachments").insert({
      task_id: data.taskId,
      user_id: context.userId,
      file_path: `gdrive:${f.id}`,
      file_name: f.name.slice(0, 300),
      size_bytes: f.size ? Number(f.size) : null,
      external_url: link,
      source: "google_drive",
      mime_type: f.mimeType?.slice(0, 200) ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, name: f.name };
  });
