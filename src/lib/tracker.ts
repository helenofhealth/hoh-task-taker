import { supabase } from "@/integrations/supabase/client";

export type TaskStatus = "requested" | "in_progress" | "on_hold" | "review" | "completed";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type AppRole = "admin" | "member" | "client";

export const STATUSES: { key: TaskStatus; label: string; token: string }[] = [
  { key: "requested", label: "Requested", token: "bg-status-requested" },
  { key: "in_progress", label: "In Progress", token: "bg-status-progress" },
  { key: "on_hold", label: "On Hold", token: "bg-status-hold" },
  { key: "review", label: "Review", token: "bg-status-review" },
  { key: "completed", label: "Completed", token: "bg-status-completed" },
];

export interface Client {
  id: string;
  name: string;
  retainer_hours: number;
  business_name?: string | null;
  email: string;
  phone?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  hourly_rate?: number | null;
  default_project?: string | null;
}


export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  client_id: string | null;
}

export interface Task {
  id: string;
  client_id: string | null;
  title: string;
  project: string | null;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  owner_id: string | null;
  is_recurring: boolean;
  recurrence: string | null;
  start_date: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
  /** 'staff' or 'client_request'. */
  source?: string;
  /** GHL sub-account the work is for. */
  sub_account?: string | null;
  proven_task_id?: string | null;
  subtasks?: string[];
  /** Subtask labels that have been ticked off. */
  subtasks_done?: string[];
  deliverables?: string[];
  qc_checklist?: string[];
  requested_completion_date?: string | null;
  estimated_hours?: number | null;
  /** 'not_required' | 'pending' | 'approved' | 'rejected'. */
  approval_status?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  ghl_task_id?: string | null;
  ghl_synced_at?: string | null;
  ghl_sync_error?: string | null;
}

export interface ProvenTask {
  id: string;
  title: string;
  description: string | null;
  category: string;
  subtasks: string[];
  deliverables: string[];
  qc_checklist: string[];
  default_instructions: string | null;
  estimated_hours: number | null;
  status: "active" | "draft" | "archived";
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchProvenTasks(): Promise<ProvenTask[]> {
  const { data, error } = await db
    .from("proven_tasks")
    .select("*")
    .order("category")
    .order("title");
  if (error) throw error;
  return (data ?? []) as ProvenTask[];
}

export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
  note: string | null;
  limit_override?: boolean | null;
  override_minutes?: number | null;
  /** false = time logged against the client's complimentary (free) hours. */
  billable?: boolean | null;
}

export type AuditAction = "started" | "stopped" | "adjusted" | "deleted";

export interface TimeEntryAudit {
  id: string;
  time_entry_id: string;
  task_id: string;
  actor_id: string | null;
  entry_user_id: string | null;
  action: AuditAction;
  started_at: string | null;
  ended_at: string | null;
  raw_minutes: number | null;
  rounded_minutes: number | null;
  rounding_delta_minutes: number | null;
  note: string | null;
  created_at: string;
  limit_override?: boolean | null;
  override_minutes?: number | null;
  billable?: boolean | null;
}



export interface HourCredit {
  id: string;
  client_id: string;
  hours: number;
  kind: string;
  /** false = complimentary hours granted at no charge. */
  billable?: boolean;
  effective_month: string | null;
  note: string | null;
  created_at: string;
  /** Hour packages expire 3 months after purchase; retainers at month end. */
  expires_at?: string | null;
}

export interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  edited_at: string | null;
}

export interface CommentEdit {
  id: string;
  comment_id: string;
  edited_by: string;
  old_body: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  task_id: string;
  user_id: string | null;
  file_path: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
}

const db = supabase as unknown as {
  from: (t: string) => any;
};

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await db
    .from("clients")
    .select("*")
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Client[];
}

export async function fetchArchivedClients(): Promise<Client[]> {
  const { data, error } = await db
    .from("clients")
    .select("*")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Client[];
}

export interface ClientAuditRow {
  id: string;
  client_id: string;
  actor_id: string | null;
  action: "archived" | "restored";
  reason: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
}

export async function fetchClientAudit(): Promise<ClientAuditRow[]> {
  const { data, error } = await db
    .from("client_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ClientAuditRow[];
}


export interface HourCreditAuditRow {
  id: string;
  credit_id: string;
  client_id: string;
  actor_id: string | null;
  action: "added" | "edited" | "removed";
  hours: number | null;
  previous_hours: number | null;
  kind: string | null;
  previous_kind: string | null;
  billable: boolean | null;
  previous_billable: boolean | null;
  effective_month: string | null;
  expires_at: string | null;
  previous_expires_at: string | null;
  note: string | null;
  created_at: string;
}

export async function fetchCreditAudit(): Promise<HourCreditAuditRow[]> {
  const { data, error } = await db
    .from("hour_credit_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as HourCreditAuditRow[];
}


export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await db.from("visible_profiles").select("*").order("full_name");
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchRoles(): Promise<{ user_id: string; role: AppRole }[]> {
  const { data, error } = await db.from("user_roles").select("user_id, role");
  if (error) throw error;
  return (data ?? []) as { user_id: string; role: AppRole }[];
}

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .is("deleted_at", null)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Task[];
}

/** Soft-delete tasks (recoverable) and log the bulk action. */
export async function softDeleteTasks(ids: string[], actorId: string, titles: string[]) {
  const { error } = await db
    .from("tasks")
    .update({ deleted_at: new Date().toISOString(), deleted_by: actorId })
    .in("id", ids);
  if (error) throw error;
  await db.from("task_bulk_delete_audit").insert({
    actor_id: actorId,
    action: "deleted",
    task_ids: ids,
    task_count: ids.length,
    task_titles: titles,
  });
}

/** Restore previously soft-deleted tasks and log the restore. */
export async function restoreTasks(ids: string[], actorId: string, titles: string[]) {
  const { error } = await db
    .from("tasks")
    .update({ deleted_at: null, deleted_by: null })
    .in("id", ids);
  if (error) throw error;
  await db.from("task_bulk_delete_audit").insert({
    actor_id: actorId,
    action: "restored",
    task_ids: ids,
    task_count: ids.length,
    task_titles: titles,
  });
}


export async function fetchTimeEntries(): Promise<
  (TimeEntry & { tasks: { client_id: string | null; project?: string | null } | null })[]
> {
  const { data, error } = await db
    .from("time_entries")
    .select("*, tasks(client_id, project)")
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Timer audit trail. Pass a task id to scope it to one task. */
export async function fetchTimeAudit(taskId?: string): Promise<TimeEntryAudit[]> {
  let q = db
    .from("time_entry_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (taskId) q = q.eq("task_id", taskId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TimeEntryAudit[];
}

/** Audit rows recorded between two dates (inclusive), oldest first.
 *  Optionally filter by action and/or task id. Client filtering is best done
 *  by the caller using the tasks list (audit rows do not store client_id). */
export async function fetchTimeAuditRange(
  from: string,
  to: string,
  options?: { action?: AuditAction | null; taskId?: string | null },
): Promise<TimeEntryAudit[]> {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  let q = db
    .from("time_entry_audit")
    .select("*")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true });
  if (options?.action) q = q.eq("action", options.action);
  if (options?.taskId) q = q.eq("task_id", options.taskId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TimeEntryAudit[];
}

function csvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV document from a header row and data rows. */
export function toCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Trigger a browser download for text content. */
export function downloadTextFile(fileName: string, content: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Trigger a browser download for an .xlsx workbook built from a header row and data rows. */
export async function downloadXlsxFile(
  fileName: string,
  headers: string[],
  rows: unknown[][],
  sheetName = "Audit trail",
) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((h, i) => ({
    wch: Math.min(
      42,
      Math.max(h.length + 2, ...rows.map((r) => String(r[i] ?? "").length + 2), 10),
    ),
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const url = URL.createObjectURL(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchCredits(): Promise<HourCredit[]> {
  const { data, error } = await db
    .from("hour_credits")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HourCredit[];
}

export async function fetchFollowers(): Promise<{ task_id: string; user_id: string }[]> {
  const { data, error } = await db.from("task_followers").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function fetchOwners(): Promise<{ task_id: string; user_id: string }[]> {
  const { data, error } = await db.from("task_owners").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function fetchComments(taskId: string): Promise<Comment[]> {
  const { data, error } = await db
    .from("task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Comment[];
}

export async function fetchCommentEdits(commentIds: string[]): Promise<CommentEdit[]> {
  if (commentIds.length === 0) return [];
  const { data, error } = await db
    .from("task_comment_edits")
    .select("*")
    .in("comment_id", commentIds)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as CommentEdit[];
}

export async function updateComment(commentId: string, newBody: string) {
  if (!newBody.trim()) throw new Error("Comment can't be empty");
  if (newBody.length > 4000) throw new Error("Comment is too long");
  const { error } = await db.from("task_comments").update({ body: newBody.trim() }).eq("id", commentId);
  if (error) throw error;
}

export async function deleteComment(commentId: string) {
  const { error } = await db.from("task_comments").delete().eq("id", commentId);
  if (error) throw error;
}

export async function fetchAttachments(taskId: string): Promise<Attachment[]> {
  const { data, error } = await db
    .from("task_attachments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Attachment[];
}

/** Timer helpers -------------------------------------------------------- */

export async function startTimer(taskId: string, userId: string, billable = true) {
  const { error } = await db
    .from("time_entries")
    .insert({ task_id: taskId, user_id: userId, started_at: new Date().toISOString(), billable });
  if (error) throw error;
}

/** Stops a running timer. Pass an override when the logged time knowingly
 *  exceeds the client's remaining hours — it is recorded on the entry and in
 *  the audit trail. */
export async function stopTimer(
  entryId: string,
  override?: { overageMinutes: number } | null,
) {
  const patch: Record<string, unknown> = { ended_at: new Date().toISOString() };
  if (override && override.overageMinutes > 0) {
    patch['limit_override'] = true;
    patch['override_minutes'] = Math.round(override.overageMinutes * 100) / 100;
  }
  const { error } = await db.from("time_entries").update(patch).eq("id", entryId);
  if (error) throw error;
}

/** Trigger a browser download for a simple tabular PDF report. */
export async function downloadPdfReport(
  fileName: string,
  title: string,
  subtitle: string[],
  headers: string[],
  rows: unknown[][],
  columnWidths?: number[],
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const usable = pageWidth - margin * 2;
  const weights = columnWidths ?? headers.map(() => 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / weightSum) * usable);

  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const line of subtitle) {
    doc.text(line, margin, y);
    y += 12;
  }
  y += 6;

  const drawHead = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    let x = margin;
    headers.forEach((h, i) => {
      doc.text(String(h), x, y);
      x += widths[i]!;
    });
    y += 6;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;
    doc.setFont("helvetica", "normal");
  };
  drawHead();

  for (const row of rows) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawHead();
    }
    let x = margin;
    row.forEach((cell, i) => {
      const text = cell == null ? "" : String(cell);
      const lines = doc.splitTextToSize(text, widths[i]! - 6) as string[];
      doc.text(lines.slice(0, 2), x, y);
      x += widths[i]!;
    });
    y += 14;
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


/** Formatting ----------------------------------------------------------- */

export function hoursFromMinutes(minutes: number) {
  return minutes / 60;
}

export function formatHours(hours: number) {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}h`;
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function elapsedMinutes(startedAt: string) {
  return Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 60000);
}

/** hh:mm:ss clock for a running timer. */
export function formatClock(minutes: number) {
  const total = Math.max(0, Math.floor(minutes * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Rounds up to the next 15-minute increment (minimum 15). */
export function roundedPreview(minutes: number) {
  return Math.max(15, Math.ceil(minutes / 15) * 15);
}

export function currentMonthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

export interface ClientBalance {
  /** Every hour ever added, including hours that have since expired. */
  bought: number;
  /** Portion of `bought` that was charged to the client. */
  boughtBillable: number;
  /** Portion of `bought` granted for free. */
  boughtFree: number;
  used: number;
  /** Portion of `used` logged as complimentary (free) time. */
  usedFree: number;
  /** Portion of `used` logged as billable time. */
  usedBillable: number;
  /** Hours still usable today (expired hours excluded). */
  remaining: number;
  /** Portion of `remaining` sitting in complimentary (free) buckets. */
  remainingFree: number;
  /** Hours that were never used before their expiry date passed. */
  expired: number;
  /** Earliest expiry date (YYYY-MM-DD) that still holds unused hours. */
  nextExpiry: string | null;
  /** Days until nextExpiry (0 = expires today), null when nothing is pending. */
  expiresInDays: number | null;
  /** Unused hours sitting in that next-to-expire bucket. */
  expiringHours: number;
  /** Unused hours still sitting in retainer credits (excludes hour packages). */
  retainerRemaining: number;
  /** Earliest expiry date of a retainer credit that still holds unused hours. */
  retainerExpiry: string | null;
  /** Days until retainerExpiry, null when no retainer hours are left. */
  retainerExpiresInDays: number | null;
  monthRetainer: number;
  monthUsed: number;
  /** Still-usable credit buckets, soonest expiry first (funding order). */
  remainingBuckets: CreditBucket[];
}

export interface CreditBucket {
  /** YYYY-MM-DD the bucket stops funding new time. */
  expiry: string;
  /** Unused hours left in this bucket. */
  hours: number;
  /** true = complimentary hours. */
  free: boolean;
  /** true = monthly retainer, false = hour package. */
  retainer: boolean;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(dateISO: string) {
  const day = 86400000;
  const target = Date.parse(`${dateISO}T00:00:00Z`);
  const today = Date.parse(`${todayISO()}T00:00:00Z`);
  return Math.round((target - today) / day);
}

/** Fallback expiry for rows saved before expiry tracking existed. */
export function creditExpiry(credit: HourCredit): string {
  if (credit.expires_at) return credit.expires_at;
  const base = credit.effective_month ?? credit.created_at.slice(0, 10);
  const d = new Date(`${base}T00:00:00Z`);
  if (credit.kind === "retainer") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}


export function computeBalance(
  clientId: string,
  clients: Client[],
  credits: HourCredit[],
  entries: (TimeEntry & { tasks: { client_id: string | null } | null })[],
): ClientBalance {
  const client = clients.find((c) => c.id === clientId);
  const monthStart = currentMonthStart();
  const clientCredits = credits.filter((c) => c.client_id === clientId);
  const bought = clientCredits.reduce((sum, c) => sum + Number(c.hours), 0);
  const boughtFree = clientCredits
    .filter((c) => c.billable === false)
    .reduce((sum, c) => sum + Number(c.hours), 0);
  const clientEntries = entries.filter((e) => e.tasks?.client_id === clientId && e.minutes);
  const used = clientEntries.reduce((s, e) => s + hoursFromMinutes(e.minutes ?? 0), 0);
  const usedFree = clientEntries
    .filter((e) => e.billable === false)
    .reduce((s, e) => s + hoursFromMinutes(e.minutes ?? 0), 0);
  const monthUsed = clientEntries
    .filter((e) => e.started_at.slice(0, 10) >= monthStart)
    .reduce((s, e) => s + hoursFromMinutes(e.minutes ?? 0), 0);

  // Spend each logged session against the buckets that were still valid on the
  // day it was tracked, soonest expiry first. Expired packages must not absorb
  // newer time — otherwise last month's dead retainer would swallow this
  // month's hours and "Remaining" would stay artificially high.
  const buckets = clientCredits
    .map((c) => ({
      expiry: creditExpiry(c),
      left: Number(c.hours),
      free: c.billable === false,
      retainer: c.kind === "retainer",
    }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));

  const spend = (amount: number, preferFree: boolean, onDate: string) => {
    let toSpend = amount;
    for (const pass of [preferFree, !preferFree]) {
      for (const bucket of buckets) {
        if (toSpend <= 0) return 0;
        if (bucket.free !== pass) continue;
        // A bucket can only fund time tracked before it expired.
        if (bucket.expiry < onDate) continue;
        const take = Math.min(bucket.left, toSpend);
        bucket.left -= take;
        toSpend -= take;
      }
    }
    return Math.max(0, toSpend);
  };

  const today = todayISO();
  let unfunded = 0;
  for (const entry of [...clientEntries].sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    const day = entry.started_at.slice(0, 10);
    const over = spend(hoursFromMinutes(entry.minutes ?? 0), entry.billable === false, day);
    // Only current-period overruns eat into today's balance; overruns from
    // closed (expired) periods were already settled and don't carry forward.
    if (day >= monthStart) unfunded += over;
  }


  const live = buckets.filter((b) => b.expiry >= today && b.left > 0.0001);
  const expired = buckets
    .filter((b) => b.expiry < today)
    .reduce((s, b) => s + b.left, 0);
  const remaining = live.reduce((s, b) => s + b.left, 0) - Math.max(0, unfunded);
  const remainingFree = live.filter((b) => b.free).reduce((s, b) => s + b.left, 0);

  const next = live[0] ?? null;
  // Retainer hours do not roll over: they sit in month-scoped buckets that
  // expire at month end, so surface the soonest one that still has hours left.
  const liveRetainers = live.filter((b) => b.retainer);
  const retainerRemaining = liveRetainers.reduce((s, b) => s + b.left, 0);
  const nextRetainer = liveRetainers[0] ?? null;

  return {
    bought,
    boughtBillable: bought - boughtFree,
    boughtFree,
    used,
    usedFree,
    usedBillable: used - usedFree,
    remaining,
    remainingFree,
    expired,
    nextExpiry: next ? next.expiry : null,
    expiresInDays: next ? daysUntil(next.expiry) : null,
    expiringHours: next ? next.left : 0,
    retainerRemaining,
    retainerExpiry: nextRetainer ? nextRetainer.expiry : null,
    retainerExpiresInDays: nextRetainer ? daysUntil(nextRetainer.expiry) : null,
    monthRetainer: Number(client?.retainer_hours ?? 0),

    monthUsed,
    remainingBuckets: live.map((b) => ({
      expiry: b.expiry,
      hours: b.left,
      free: b.free,
      retainer: b.retainer,
    })),
  };
}

export interface CreditTimelineRow {
  id: string;
  kind: string;
  free: boolean;
  retainer: boolean;
  note: string | null;
  /** Date the credit was added (YYYY-MM-DD). */
  addedOn: string;
  /** Date the credit stops funding new time (YYYY-MM-DD). */
  expiry: string;
  /** Days until expiry — negative once expired. */
  expiresInDays: number;
  /** Hours originally granted. */
  hours: number;
  /** Hours consumed by logged time. */
  used: number;
  /** Hours left in this credit. */
  left: number;
  /** active = usable today, expiring = usable but within 14 days, expired. */
  status: "active" | "expiring" | "expired";
}

/** Per-credit timeline for one client: what each credit held, what it funded,
 *  and when it expires. Uses the same soonest-expiry-first spending order as
 *  computeBalance so the numbers always agree. */
export function creditTimeline(
  clientId: string,
  credits: HourCredit[],
  entries: (TimeEntry & { tasks: { client_id: string | null } | null })[],
): CreditTimelineRow[] {
  const clientCredits = credits.filter((c) => c.client_id === clientId);
  const clientEntries = entries.filter((e) => e.tasks?.client_id === clientId && e.minutes);

  const buckets = clientCredits
    .map((c) => ({
      credit: c,
      expiry: creditExpiry(c),
      hours: Number(c.hours),
      left: Number(c.hours),
      free: c.billable === false,
    }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));

  const spend = (amount: number, preferFree: boolean, onDate: string) => {
    let toSpend = amount;
    for (const pass of [preferFree, !preferFree]) {
      for (const bucket of buckets) {
        if (toSpend <= 0) return;
        if (bucket.free !== pass) continue;
        if (bucket.expiry < onDate) continue;
        const take = Math.min(bucket.left, toSpend);
        bucket.left -= take;
        toSpend -= take;
      }
    }
  };

  for (const entry of [...clientEntries].sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    spend(hoursFromMinutes(entry.minutes ?? 0), entry.billable === false, entry.started_at.slice(0, 10));
  }

  const today = todayISO();
  return buckets.map((b) => {
    const days = daysUntil(b.expiry);
    return {
      id: b.credit.id,
      kind: b.credit.kind,
      free: b.free,
      retainer: b.credit.kind === "retainer",
      note: b.credit.note,
      addedOn: b.credit.effective_month ?? b.credit.created_at.slice(0, 10),
      expiry: b.expiry,
      expiresInDays: days,
      hours: b.hours,
      used: b.hours - b.left,
      left: b.left,
      status: b.expiry < today ? "expired" : days <= 14 ? "expiring" : "active",
    };
  });
}

/** "in 12 days" / "today" / "tomorrow" / "expired" label for an expiry date. */
export function expiryLabel(days: number | null) {
  if (days === null) return "—";
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
