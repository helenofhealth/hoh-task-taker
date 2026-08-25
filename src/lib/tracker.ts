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
