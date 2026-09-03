// Server-only helper: pushes an approved task brief into GoHighLevel as a real
// task (with its sub-tasks folded into the task body) inside the right sub-account.
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

interface GhlHeaders {
  Authorization: string;
  Version: string;
  Accept: string;
  "Content-Type": string;
}

function headers(apiKey: string): GhlHeaders {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: GHL_VERSION,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function ghlFetch(apiKey: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    ...init,
    headers: { ...headers(apiKey), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GoHighLevel ${path} returned ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export interface GhlTaskPayload {
  title: string;
  description: string | null;
  subtasks: string[];
  deliverables: string[];
  qcChecklist: string[];
  dueDate: string | null;
  estimatedHours: number | null;
  subAccount: string | null;
  clientName: string;
  clientEmail: string | null;
  appLink: string;
}

export interface GhlPushResult {
  locationId: string;
  contactId: string;
  taskId: string;
}

/** Builds the task body so the GHL task carries the full brief and sub-tasks. */
export function buildGhlBody(p: GhlTaskPayload) {
  const list = (label: string, items: string[]) =>
    items.length > 0
      ? `\n${label}:\n${items.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}`
      : "";
  return [
    p.description ?? "",
    list("Sub-tasks", p.subtasks),
    list("Deliverables", p.deliverables),
    list("QC checklist", p.qcChecklist),
    p.estimatedHours != null ? `\nEstimate: ${p.estimatedHours}h` : "",
    p.subAccount ? `\nSub-account: ${p.subAccount}` : "",
    `\nClient: ${p.clientName}`,
    `\nTask in Helen of Health Task Taker: ${p.appLink}`,
  ]
    .filter((s) => s.trim().length > 0)
    .join("\n")
    .slice(0, 5000);
}

export interface GhlCredentials {
  apiKey: string;
  /** Location to use when the client connected their own agency. */
  locationId: string | null;
  /** Whether the credentials belong to the client's own agency. */
  ownAgency: boolean;
}

/**
 * Picks the credentials to push with: the client's own connected agency when
 * they have one, otherwise our agency key.
 */
export async function resolveGhlCredentials(
  supabaseAdmin: any,
  clientId: string | null,
): Promise<GhlCredentials | null> {
  if (clientId) {
    const { data: own } = await supabaseAdmin
      .from("client_ghl_connections")
      .select("api_key, location_id")
      .eq("client_id", clientId)
      .maybeSingle();
    if (own?.api_key) {
      return { apiKey: own.api_key, locationId: own.location_id ?? null, ownAgency: true };
    }
  }
  const agencyKey = process.env["GHL_API_KEY"];
  if (agencyKey) return { apiKey: agencyKey, locationId: null, ownAgency: false };
  return null;
}

/** Resolves the GHL location id for a sub-account name (falls back to the only one). */
async function resolveLocationId(
  supabaseAdmin: any,
  subAccount: string | null,
  fallbackLocationId: string | null,
): Promise<string> {
  const { data } = await supabaseAdmin.from("ghl_sub_accounts").select("ghl_id, name");
  const rows = (data ?? []) as { ghl_id: string; name: string }[];
  if (subAccount) {
    const wanted = subAccount.trim().toLowerCase();
    const hit = rows.find((r) => r.name.trim().toLowerCase() === wanted);
    if (hit) return hit.ghl_id;
    if (!fallbackLocationId) {
      throw new Error(`No synced GoHighLevel sub-account named "${subAccount}".`);
    }
  }
  if (fallbackLocationId) return fallbackLocationId;
  if (rows.length === 0) {
    throw new Error("No GoHighLevel sub-accounts synced yet — run the sync in Settings first.");
  }
  if (rows.length === 1) return rows[0]!.ghl_id;
  throw new Error("This task has no sub-account set, so we can't tell where to create it in GoHighLevel.");
}

/** Finds an existing contact by email in the location, or creates one for the client. */
async function resolveContactId(
  apiKey: string,
  locationId: string,
  clientName: string,
  clientEmail: string | null,
): Promise<string> {
  if (clientEmail) {
    const found = (await ghlFetch(
      apiKey,
      `/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(clientEmail)}`,
      { method: "GET" },
    )) as { contacts?: { id: string; email?: string }[] };
    const match = (found.contacts ?? []).find(
      (c) => (c.email ?? "").toLowerCase() === clientEmail.toLowerCase(),
    );
    if (match?.id) return match.id;
  }
  const created = (await ghlFetch(apiKey, "/contacts/", {
    method: "POST",
    body: JSON.stringify({
      locationId,
      name: clientName,
      ...(clientEmail ? { email: clientEmail } : {}),
      source: "Helen of Health Task Taker",
    }),
  })) as { contact?: { id: string } };
  const id = created.contact?.id;
  if (!id) throw new Error("GoHighLevel did not return a contact to attach the task to.");
  return id;
}

/** Creates the real GHL task and returns the ids we store against our task. */
export async function pushBriefToGhl(
  supabaseAdmin: any,
  apiKey: string,
  payload: GhlTaskPayload,
): Promise<GhlPushResult> {
  const locationId = await resolveLocationId(supabaseAdmin, payload.subAccount);
  const contactId = await resolveContactId(
    apiKey,
    locationId,
    payload.clientName,
    payload.clientEmail,
  );
  const due = payload.dueDate
    ? new Date(`${payload.dueDate}T12:00:00Z`).toISOString()
    : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const created = (await ghlFetch(apiKey, `/contacts/${contactId}/tasks`, {
    method: "POST",
    body: JSON.stringify({
      title: payload.title.slice(0, 200),
      body: buildGhlBody(payload),
      dueDate: due,
      completed: false,
    }),
  })) as { id?: string; task?: { id?: string } };

  const taskId = created.id ?? created.task?.id;
  if (!taskId) throw new Error("GoHighLevel did not return a task id.");
  return { locationId, contactId, taskId };
}
