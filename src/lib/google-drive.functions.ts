import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR = "google_drive";
const ROOT_FOLDER = "Helen of Health Task Taker";
const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.file",
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
    // Create the app's root folder right away so later saves never fail on a missing folder.
    let folderReady = true;
    try {
      await ensureFolder(connectionAPIKey, ROOT_FOLDER);
    } catch (e) {
      console.error("Could not create Drive root folder", e);
      folderReady = false;
    }
    return { ok: true, folderReady };
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
      drive_file_id: f.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true, name: f.name };
  });

class DriveRenewError extends Error {}

/** Turns an expired Drive grant into a normal result instead of a thrown server error. */
async function withRenew<T>(fn: () => Promise<T>): Promise<T | { reconnectRequired: true }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DriveRenewError) return { reconnectRequired: true as const };
    throw e;
  }
}

async function driveSend(key: string, path: string, init: RequestInit) {
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId: CONNECTOR,
    path,
    init,
    requiredScopes: SCOPES,
  });
  if (await appUserReconnectRequired(res)) throw new DriveRenewError("Your Google Drive access needs to be renewed.");
  if (!res.ok) {
    const body = await res.text();
    console.error(`Drive request failed [${res.status}]: ${body}`);
    throw new Error(`Google Drive request failed [${res.status}]`);
  }
  return res.json() as Promise<{ id: string; webViewLink?: string; files?: { id: string }[] }>;
}

async function ensureFolder(key: string, name: string, parent?: string) {
  const safe = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = '${safe}'${parent ? ` and '${parent}' in parents` : ""}`;
  const found = await driveSend(key, `/drive/v3/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`, { method: "GET" });
  if (found.files?.[0]) return found.files[0].id;
  const created = await driveSend(key, "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}) }),
  });
  return created.id;
}

/** Copy app-uploaded task documents into the signed-in user's Google Drive. */
export const syncFilesToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: z.string().uuid().optional() }).parse(d))
  .handler(async (args) => withRenew(async () => {
    const key = await loadKey(context.userId);
    if (!key) throw new Error("Connect Google Drive first.");
    let q = context.supabase
      .from("task_attachments")
      .select("id, task_id, file_path, file_name, mime_type, tasks(title)")
      .eq("source", "upload")
      .is("drive_file_id", null)
      .limit(25);
    if (data.taskId) q = q.eq("task_id", data.taskId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows?.length) return { synced: 0, failed: 0, remaining: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const root = await ensureFolder(key, ROOT_FOLDER);
    const folders = new Map<string, string>();
    let synced = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        const title = ((r as { tasks?: { title?: string } | null }).tasks?.title ?? "Task").slice(0, 120);
        let folder = folders.get(r.task_id);
        if (!folder) {
          folder = await ensureFolder(key, title, root);
          folders.set(r.task_id, folder);
        }
        const { data: blob, error: dlErr } = await context.supabase.storage.from("task-files").download(r.file_path);
        if (dlErr || !blob) throw new Error(dlErr?.message ?? "download failed");
        const boundary = `hoh${crypto.randomUUID()}`;
        const meta = JSON.stringify({ name: r.file_name, parents: [folder] });
        const mime = r.mime_type || blob.type || "application/octet-stream";
        const body = new Blob([
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
          await blob.arrayBuffer(),
          `\r\n--${boundary}--`,
        ]);
        const up = await driveSend(key, "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        });
        await supabaseAdmin
          .from("task_attachments")
          .update({
            drive_file_id: up.id,
            drive_synced_at: new Date().toISOString(),
            external_url: up.webViewLink ?? `https://drive.google.com/file/d/${up.id}/view`,
          })
          .eq("id", r.id);
        synced++;
      } catch (e) {
        if (e instanceof DriveRenewError) throw e;
        console.error("Drive sync failed for", r.id, e);
        failed++;
      }
    }
    const { count } = await context.supabase
      .from("task_attachments")
      .select("id", { count: "exact", head: true })
      .eq("source", "upload")
      .is("drive_file_id", null);
    return { synced, failed, remaining: count ?? 0 };
  }));

type DriveListed = { id: string; name: string; mimeType: string; size?: string; webViewLink?: string };

async function listChildren(key: string, parent: string, foldersOnly: boolean) {
  const out: DriveListed[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${parent}' in parents and trashed = false and mimeType ${foldersOnly ? "=" : "!="} 'application/vnd.google-apps.folder'`,
      fields: "nextPageToken, files(id,name,mimeType,size,webViewLink)",
      pageSize: "200",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const r = (await driveSend(key, `/drive/v3/files?${params}`, { method: "GET" })) as unknown as {
      files?: DriveListed[];
      nextPageToken?: string;
    };
    out.push(...(r.files ?? []));
    pageToken = r.nextPageToken ?? "";
  } while (pageToken && out.length < 2000);
  return out;
}

/**
 * Pull: every file inside "Helen of Health Task Taker/<task title>" in the user's Drive
 * gets linked to the matching task (tasks the user can see), skipping files already linked.
 */
export const pullFilesFromDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (args) => withRenew(async () => {
    const key = await loadKey(context.userId);
    if (!key) throw new Error("Connect Google Drive first.");
    const root = await ensureFolder(key, ROOT_FOLDER);
    const { data: tasks, error } = await context.supabase.from("tasks").select("id, title").is("deleted_at", null);
    if (error) throw new Error(error.message);
    const byTitle = new Map<string, string>();
    for (const t of tasks ?? []) byTitle.set(t.title.slice(0, 120).trim().toLowerCase(), t.id);
    const folders = await listChildren(key, root, true);
    let imported = 0;
    let unmatched = 0;
    for (const folder of folders) {
      const taskId = byTitle.get(folder.name.trim().toLowerCase());
      if (!taskId) {
        unmatched++;
        continue;
      }
      const files = await listChildren(key, folder.id, false);
      if (!files.length) continue;
      const { data: existing } = await context.supabase
        .from("task_attachments")
        .select("drive_file_id")
        .eq("task_id", taskId)
        .in("drive_file_id", files.map((f) => f.id));
      const known = new Set((existing ?? []).map((e) => e.drive_file_id));
      const fresh = files.filter((f) => !known.has(f.id));
      if (!fresh.length) continue;
      const { error: insErr } = await context.supabase.from("task_attachments").insert(
        fresh.map((f) => ({
          task_id: taskId,
          user_id: context.userId,
          file_path: `gdrive:${f.id}`,
          file_name: f.name.slice(0, 300),
          size_bytes: f.size ? Number(f.size) : null,
          external_url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
          source: "google_drive",
          mime_type: f.mimeType?.slice(0, 200) ?? null,
          drive_file_id: f.id,
        })),
      );
      if (insErr) throw new Error(insErr.message);
      imported += fresh.length;
    }
    return { imported, unmatchedFolders: unmatched };
  }));

/** Create a folder in the user's Drive — inside the app folder, or as a task's folder. */
export const createDriveFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ name: z.string().trim().max(120).optional(), taskId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async (args) => withRenew(async () => {
    const key = await loadKey(context.userId);
    if (!key) throw new Error("Connect Google Drive first.");
    const root = await ensureFolder(key, ROOT_FOLDER);
    let name = data.name ?? "";
    if (data.taskId) {
      const { data: task, error } = await context.supabase.from("tasks").select("title").eq("id", data.taskId).maybeSingle();
      if (error || !task) throw new Error("Task not found");
      name = task.title.slice(0, 120);
    }
    if (!name) throw new Error("Give the folder a name.");
    const id = await ensureFolder(key, name, root);
    return { id, name, url: `https://drive.google.com/drive/folders/${id}` };
  }));
