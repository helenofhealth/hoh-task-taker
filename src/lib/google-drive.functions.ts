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
    await shareForPreview(key, f.id);
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

/** Lets the Drive preview embed show the file to anyone who has the link. Best-effort. */
async function shareForPreview(key: string, fileId: string) {
  try {
    await driveSend(key, `/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });
  } catch (e) {
    console.error("Drive shareForPreview failed for", fileId, e);
  }
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
  .handler(async ({ data, context }) => withRenew(async () => {
    const key = await loadKey(context.userId);
    if (!key) throw new Error("Connect Google Drive first.");
    let q = context.supabase
      .from("task_attachments")
      .select("id, task_id, file_path, file_name, mime_type, tasks(title, clients(name))")
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
        const taskInfo = (r as { tasks?: { title?: string; clients?: { name?: string } | null } | null }).tasks;
        const title = (taskInfo?.title ?? "Task").slice(0, 120);
        const clientName = (taskInfo?.clients?.name ?? "No client").slice(0, 120);
        let folder = folders.get(r.task_id);
        if (!folder) {
          const clientFolder = await ensureFolder(key, clientName, root);
          folder = await ensureFolder(key, title, clientFolder);
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
        await shareForPreview(key, up.id);
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
 * Pull: every file inside "Helen of Health Task Taker/<client name>/<task title>" in the
 * user's Drive gets linked to the matching task (tasks the user can see), skipping files
 * already linked. Top-level task folders without a client folder are matched too.
 */
export const pullFilesFromDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => withRenew(async () => {
    const key = await loadKey(context.userId);
    if (!key) throw new Error("Connect Google Drive first.");
    return pullForUser(key, context.supabase, context.userId, null);
  }));

/**
 * Imports files found in "<root>/<client>/<task>" folders of one user's Drive.
 * `db` must only see tasks the user may see (their RLS client, or admin + onlyClientId for clients).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pullForUser(key: string, db: any, userId: string, onlyClientId: string | null) {
    const root = await ensureFolder(key, ROOT_FOLDER);
    let tq = db.from("tasks").select("id, title, clients(name)").is("deleted_at", null);
    if (onlyClientId) tq = tq.eq("client_id", onlyClientId);
    const { data: tasks, error } = await tq;
    if (error) throw new Error(error.message);
    type TaskRow = { id: string; title: string; clients?: { name?: string } | null };
    // Match on "client name/task title"; tasks without a client match on title alone.
    const byPath = new Map<string, string>();
    for (const t of (tasks ?? []) as TaskRow[]) {
      const title = t.title.slice(0, 120).trim().toLowerCase();
      const client = (t.clients?.name ?? "").slice(0, 120).trim().toLowerCase();
      byPath.set(client ? `${client}/${title}` : title, t.id);
    }
    const clientFolders = await listChildren(key, root, true);
    let imported = 0;
    let unmatched = 0;
    // Each top-level folder is a client folder; task folders sit one level below.
    const taskFolders: { folder: DriveListed; clientName: string }[] = [];
    for (const clientFolder of clientFolders) {
      const subs = await listChildren(key, clientFolder.id, true);
      if (subs.length) {
        for (const sub of subs) taskFolders.push({ folder: sub, clientName: clientFolder.name });
      } else {
        // Legacy layout: task folder directly under the root.
        taskFolders.push({ folder: clientFolder, clientName: "" });
      }
    }
    for (const { folder, clientName } of taskFolders) {
      const clientKey = clientName.trim().toLowerCase();
      const titleKey = folder.name.trim().toLowerCase();
      const taskId = byPath.get(clientKey ? `${clientKey}/${titleKey}` : titleKey) ?? byPath.get(titleKey);
      if (!taskId) {
        unmatched++;
        continue;
      }
      const files = await listChildren(key, folder.id, false);
      if (!files.length) continue;
      const { data: existing } = await db
        .from("task_attachments")
        .select("drive_file_id")
        .eq("task_id", taskId)
        .in("drive_file_id", files.map((f) => f.id));
      const known = new Set((existing ?? []).map((e: { drive_file_id: string | null }) => e.drive_file_id));
      const fresh = files.filter((f) => !known.has(f.id));
      if (!fresh.length) continue;
      const { error: insErr } = await db.from("task_attachments").insert(
        fresh.map((f) => ({
          task_id: taskId,
          user_id: userId,
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
      for (const f of fresh) await shareForPreview(key, f.id);
      imported += fresh.length;
    }
    return { imported, unmatchedFolders: unmatched };
}


/** Create a folder in the user's Drive — inside the app folder, or as a task's folder. */
export const createDriveFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ name: z.string().trim().max(120).optional(), taskId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => withRenew(async () => {
    const key = await loadKey(context.userId);
    if (!key) throw new Error("Connect Google Drive first.");
    const root = await ensureFolder(key, ROOT_FOLDER);
    let name = data.name ?? "";
    let parent = root;
    if (data.taskId) {
      const { data: task, error } = await context.supabase
        .from("tasks")
        .select("title, clients(name)")
        .eq("id", data.taskId)
        .maybeSingle();
      if (error || !task) throw new Error("Task not found");
      name = task.title.slice(0, 120);
      const clientName = ((task as { clients?: { name?: string } | null }).clients?.name ?? "No client").slice(0, 120);
      parent = await ensureFolder(key, clientName, root);
    }
    if (!name) throw new Error("Give the folder a name.");
    const id = await ensureFolder(key, name, parent);
    return { id, name, url: `https://drive.google.com/drive/folders/${id}` };
  }));

/**
 * Checks the caller's Drive-linked files against Google Drive. Files deleted or trashed in Drive
 * are reset so they can be saved/uploaded again: app uploads lose their Drive link (Save to Drive
 * re-uploads them, recreating any deleted folders); pure Drive links are removed so they can be re-attached.
 */
export const refreshDriveFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => withRenew(async () => {
    const key = await loadKey(context.userId);
    if (!key) throw new Error("Connect Google Drive first.");
    const { data: rows, error } = await context.supabase
      .from("task_attachments")
      .select("id, source, drive_file_id")
      .eq("user_id", context.userId)
      .not("drive_file_id", "is", null)
      .limit(300);
    if (error) throw new Error(error.message);
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let reset = 0;
    let removed = 0;
    for (const r of rows ?? []) {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: key,
        connectorId: CONNECTOR,
        path: `/drive/v3/files/${encodeURIComponent(r.drive_file_id!)}?fields=id,trashed`,
        requiredScopes: SCOPES,
      });
      if (await appUserReconnectRequired(res)) throw new DriveRenewError("Your Google Drive access needs to be renewed.");
      let gone = res.status === 404;
      if (res.ok) gone = Boolean(((await res.json()) as { trashed?: boolean }).trashed);
      else if (!gone) { console.error("Drive check failed", r.id, res.status, await res.text()); continue; }
      if (!gone) {
        // Make sure older files are shared for in-app previews too.
        await shareForPreview(key, r.drive_file_id!);
        continue;
      }
      if (r.source === "upload") {
        await supabaseAdmin.from("task_attachments")
          .update({ drive_file_id: null, drive_synced_at: null, external_url: null })
          .eq("id", r.id);
        reset++;
      } else {
        await supabaseAdmin.from("task_attachments").delete().eq("id", r.id);
        removed++;
      }
    }
    return { checked: rows?.length ?? 0, reset, removed };
  }));

/** Creates "<root>/<client name>" in the caller's Drive. Silently skips when Drive isn't connected. */
export const createClientDriveFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const key = await loadKey(context.userId);
    if (!key) return { created: false as const };
    const { data: client } = await context.supabase.from("clients").select("name").eq("id", data.clientId).maybeSingle();
    if (!client) return { created: false as const };
    try {
      const root = await ensureFolder(key, ROOT_FOLDER);
      await ensureFolder(key, client.name.slice(0, 120), root);
      return { created: true as const };
    } catch (e) {
      console.error("Client Drive folder failed", e);
      return { created: false as const };
    }
  });

/** Daily job body: for every connected user, make client folders (staff) and pull new files. */
export async function runDailyDriveSync() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getConnectionKeyForUser } = await import("./app-user-connections.server");
  const { data: conns } = await supabaseAdmin.from("app_user_connections").select("user_id").eq("connector_id", CONNECTOR);
  const results: { imported: number; failed: number; users: number } = { imported: 0, failed: 0, users: 0 };
  for (const c of conns ?? []) {
    try {
      const key = await getConnectionKeyForUser(c.user_id, CONNECTOR);
      if (!key) continue;
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", c.user_id).in("role", ["admin", "member"]);
      const isStaff = (roles ?? []).length > 0;
      let onlyClientId: string | null = null;
      if (!isStaff) {
        const { data: prof } = await supabaseAdmin.from("profiles").select("client_id").eq("id", c.user_id).maybeSingle();
        if (!prof?.client_id) continue;
        onlyClientId = prof.client_id;
      } else {
        const root = await ensureFolder(key, ROOT_FOLDER);
        const { data: clients } = await supabaseAdmin.from("clients").select("name").is("archived_at", null);
        for (const cl of clients ?? []) await ensureFolder(key, cl.name.slice(0, 120), root);
      }
      const r = await pullForUser(key, supabaseAdmin, c.user_id, onlyClientId);
      results.imported += r.imported;
      results.users++;
    } catch (e) {
      console.error("Daily Drive sync failed for a user", e);
      results.failed++;
    }
  }
  return results;
}
