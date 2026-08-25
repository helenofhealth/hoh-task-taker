import { supabase } from "@/integrations/supabase/client";

export type TaskStatus = "requested" | "in_progress" | "review" | "completed";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type AppRole = "admin" | "member" | "client";

export const STATUSES: { key: TaskStatus; label: string; token: string }[] = [
  { key: "requested", label: "Requested", token: "bg-status-requested" },
  { key: "in_progress", label: "In Progress", token: "bg-status-progress" },
  { key: "review", label: "Review", token: "bg-status-review" },
  { key: "completed", label: "Completed", token: "bg-status-completed" },
];

export interface Client {
  id: string;
  name: string;
  retainer_hours: number;
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
}

export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
  note: string | null;
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
}

export interface HourCredit {
  id: string;
  client_id: string;
  hours: number;
  kind: string;
  effective_month: string | null;
  note: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
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
  const { data, error } = await db.from("clients").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Client[];
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await db.from("profiles").select("*").order("full_name");
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
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function fetchTimeEntries(): Promise<(TimeEntry & { tasks: { client_id: string | null } | null })[]> {
  const { data, error } = await db
    .from("time_entries")
    .select("*, tasks(client_id)")
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

export async function fetchComments(taskId: string): Promise<Comment[]> {
  const { data, error } = await db
    .from("task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Comment[];
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

export async function startTimer(taskId: string, userId: string) {
  const { error } = await db
    .from("time_entries")
    .insert({ task_id: taskId, user_id: userId, started_at: new Date().toISOString() });
  if (error) throw error;
}

export async function stopTimer(entryId: string) {
  const { error } = await db
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw error;
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
  bought: number;
  used: number;
  remaining: number;
  monthRetainer: number;
  monthUsed: number;
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
  const clientEntries = entries.filter((e) => e.tasks?.client_id === clientId && e.minutes);
  const used = clientEntries.reduce((s, e) => s + hoursFromMinutes(e.minutes ?? 0), 0);
  const monthUsed = clientEntries
    .filter((e) => e.started_at.slice(0, 10) >= monthStart)
    .reduce((s, e) => s + hoursFromMinutes(e.minutes ?? 0), 0);
  return {
    bought,
    used,
    remaining: bought - used,
    monthRetainer: Number(client?.retainer_hours ?? 0),
    monthUsed,
  };
}
