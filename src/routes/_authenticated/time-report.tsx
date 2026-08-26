import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { displayName, useMe } from "@/hooks/useAuth";
import {
  type AuditAction,
  computeBalance,
  downloadPdfReport,
  downloadTextFile,
  downloadXlsxFile,

  fetchClients,
  fetchCredits,
  fetchProfiles,
  fetchTasks,
  fetchTimeAuditRange,
  fetchTimeEntries,
  formatDuration,
  formatHours,
  toCsv,
} from "@/lib/tracker";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

const AUDIT_ACTIONS: { value: AuditAction; label: string }[] = [
  { value: "started", label: "Started" },
  { value: "stopped", label: "Stopped" },
  { value: "adjusted", label: "Adjusted" },
  { value: "deleted", label: "Deleted" },
];

export const Route = createFileRoute("/_authenticated/time-report")({
  head: () => ({
    meta: [
      { title: "Time report — Helen of Health Task Taker" },
      {
        name: "description",
        content:
          "See hours bought, hours used and remaining balance per client, plus every logged time entry.",
      },
      { property: "og:title", content: "Time report — Helen of Health Task Taker" },
      {
        property: "og:description",
        content: "Client hour balances and a full log of time tracked in 15-minute increments.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tasks.helenofhealth.com/time-report" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://tasks.helenofhealth.com/time-report" }],
  }),

  component: TimeReportPage,
});

function TimeReportPage() {
  const me = useMe();
  const clients = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const credits = useQuery({ queryKey: ["credits"], queryFn: fetchCredits });
  const entries = useQuery({ queryKey: ["time_entries"], queryFn: fetchTimeEntries });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });

  const clientList = clients.data ?? [];
  const myClientId = me.profile?.client_id ?? null;
  const logged = (entries.data ?? [])
    .filter((e) => e.minutes)
    .filter((e) =>
      me.isStaff
        ? true
        : (e.tasks?.client_id ?? null) === myClientId,
    );

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(isoDay(monthStart));
  const [to, setTo] = useState(isoDay(today));
  const [action, setAction] = useState<AuditAction | "all">("all");
  const [taskId, setTaskId] = useState<string>("all");
  const [clientId, setClientId] = useState<string>("all");

  // Every filter is independent and optional — "all" means "don't filter on this field".
  const actionFilter = action === "all" ? null : action;
  const taskFilter = taskId === "all" ? null : taskId;
  const clientFilter = clientId === "all" ? null : clientId;
  const hasFilters = Boolean(actionFilter || taskFilter || clientFilter);

  const inRange = (iso: string) => {
    const day = isoDay(new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000));
    return day >= from && day <= to;
  };

  const taskClientId = (taskIdValue: string, fallback?: string | null) =>
    (tasks.data ?? []).find((t) => t.id === taskIdValue)?.client_id ?? fallback ?? null;

  const filteredLogged = logged.filter((e) => {
    if (!inRange(e.started_at)) return false;
    if (taskFilter && e.task_id !== taskFilter) return false;
    if (clientFilter && taskClientId(e.task_id, e.tasks?.client_id) !== clientFilter) return false;
    return true;
  });
  const [exporting, setExporting] = useState<"csv" | "xlsx" | "report-csv" | "report-pdf" | null>(
    null,
  );

  const rawMinutes = (e: { started_at: string; ended_at: string | null }) =>
    e.ended_at
      ? Math.max(0, (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000)
      : 0;

  /** Detailed timeline: client → task → entries, newest first. */
  const timeline = useMemo(() => {
    const taskList = tasks.data ?? [];
    const byClient = new Map<
      string,
      { clientId: string | null; name: string; minutes: number; overrides: number; tasks: Map<string, { title: string; minutes: number; entries: typeof filteredLogged }> }
    >();
    const sorted = [...filteredLogged].sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
    for (const e of sorted) {
      const task = taskList.find((t) => t.id === e.task_id);
      const cid = task?.client_id ?? e.tasks?.client_id ?? null;
      const key = cid ?? "none";
      if (!byClient.has(key))
        byClient.set(key, {
          clientId: cid,
          name: clientList.find((c) => c.id === cid)?.name ?? "No client",
          minutes: 0,
          overrides: 0,
          tasks: new Map(),
        });
      const group = byClient.get(key)!;
      group.minutes += e.minutes ?? 0;
      if (e.limit_override) group.overrides += 1;
      const tKey = e.task_id;
      if (!group.tasks.has(tKey))
        group.tasks.set(tKey, { title: task?.title ?? "Task", minutes: 0, entries: [] });
      const tGroup = group.tasks.get(tKey)!;
      tGroup.minutes += e.minutes ?? 0;
      tGroup.entries.push(e);
    }
    return [...byClient.values()]
      .sort((a, b) => b.minutes - a.minutes)
      .map((g) => ({ ...g, taskGroups: [...g.tasks.values()].sort((a, b) => b.minutes - a.minutes) }));
  }, [filteredLogged, tasks.data, clientList]);

  const weekly = useMemo(() => {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    const buckets = new Map<string, number>();
    for (const e of filteredLogged) {
      const d = new Date(e.started_at);
      if (d < start || d > end) continue;
      const w = new Date(d);
      const day = (w.getDay() + 6) % 7; // Monday start
      w.setDate(w.getDate() - day);
      w.setHours(0, 0, 0, 0);
      const key = isoDay(new Date(w.getTime() - w.getTimezoneOffset() * 60000));
      buckets.set(key, (buckets.get(key) ?? 0) + (e.minutes ?? 0));
    }
    return [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([week, minutes]) => ({
        week,
        label: new Date(`${week}T00:00:00`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        hours: Math.round((minutes / 60) * 100) / 100,
      }));
  }, [filteredLogged, from, to]);

  const totalRangeHours = weekly.reduce((sum, w) => sum + w.hours, 0);

  /** Time report export (CSV or PDF) for one client, or every client in view.
   *  Per-client exports ignore the client dropdown so any card can be exported. */
  const exportReport = async (format: "csv" | "pdf", onlyClientId?: string | null) => {
    const taskList = tasks.data ?? [];
    const source = onlyClientId
      ? logged.filter(
          (e) =>
            inRange(e.started_at) &&
            (!taskFilter || e.task_id === taskFilter) &&
            taskClientId(e.task_id, e.tasks?.client_id) === onlyClientId,
        )
      : filteredLogged;
    const rows = [...source]
      .sort((a, b) => (a.started_at < b.started_at ? -1 : 1))
      .map((e) => {
        const task = taskList.find((t) => t.id === e.task_id);
        const cid = task?.client_id ?? e.tasks?.client_id ?? null;
        return [
          clientList.find((c) => c.id === cid)?.name ?? "No client",
          task?.title ?? "Task",
          displayName(profiles.data ?? [], e.user_id),
          new Date(e.started_at).toLocaleString(),
          e.ended_at ? new Date(e.ended_at).toLocaleTimeString() : "",
          Math.round(rawMinutes(e)),
          e.minutes ?? 0,
          formatDuration(e.minutes ?? 0),
          e.limit_override ? "Yes" : "",
          e.override_minutes ? Math.round(Number(e.override_minutes)) : "",
        ];
      });

    if (rows.length === 0) {
      toast.error("No logged time matches the current filters");
      return;
    }
    const headers = [
      "Client",
      "Task",
      "Member",
      "Started",
      "Stopped",
      "Measured min",
      "Logged min",
      "Logged",
      "Limit override",
      "Overage min",
    ];
    const label = onlyClientId
      ? (clientList.find((c) => c.id === onlyClientId)?.name ?? "client").replace(/[^\w-]+/g, "_")
      : "all-clients";
    setExporting(format === "pdf" ? "report-pdf" : "report-csv");
    try {
      const baseName = `time-report-${label}-${from}-${to}`;
      if (format === "pdf") {
        const totalMinutes = rows.reduce((s, r) => s + Number(r[6] ?? 0), 0);
        await downloadPdfReport(
          `${baseName}.pdf`,
          `Time report — ${onlyClientId ? clientList.find((c) => c.id === onlyClientId)?.name ?? "Client" : "All clients"}`,
          [
            `Period: ${from} to ${to}`,
            `Entries: ${rows.length} · Total logged: ${formatHours(totalMinutes / 60)} (15-minute increments)`,
            `Overrides: ${rows.filter((r) => r[8] === "Yes").length}`,
          ],
          headers,
          rows,
          [1.2, 2, 1.2, 1.4, 0.9, 0.8, 0.8, 0.8, 0.8, 0.8],
        );
      } else {
        downloadTextFile(`${baseName}.csv`, toCsv(headers, rows));
      }
      toast.success(`Exported ${rows.length} ${rows.length === 1 ? "entry" : "entries"} as ${format.toUpperCase()}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(null);
    }
  };


  const exportAudit = async (format: "csv" | "xlsx") => {
    if (from > to) {
      toast.error("Start date must be before the end date");
      return;
    }
    setExporting(format);
    try {
      const rows = await fetchTimeAuditRange(from, to, {
        action: actionFilter,
        taskId: taskFilter,
      });
      const taskList = tasks.data ?? [];
      const filtered = rows.filter((r) => {
        if (!clientFilter) return true;
        const task = taskList.find((t) => t.id === r.task_id);
        return task?.client_id === clientFilter;
      });
      if (filtered.length === 0) {
        toast.error("No audit activity matches the selected filters");
        return;
      }
      const people = profiles.data ?? [];
      const headers = [
        "Recorded at",
        "Action",
        "Task",
        "Client",
        "Performed by",
        "Timer owner",
        "Timer started",
        "Timer stopped",
        "Measured minutes",
        "Logged minutes",
        "Rounding added (min)",
        "Limit override",
        "Overage minutes",
        "Note",
        "Time entry ID",
      ];
      const dataRows = filtered.map((r) => {
        const task = taskList.find((t) => t.id === r.task_id);
        return [
          new Date(r.created_at).toISOString(),
          r.action,
          task?.title ?? r.task_id,
          clientList.find((c) => c.id === task?.client_id)?.name ?? "",
          r.actor_id ? displayName(people, r.actor_id) : "",
          r.entry_user_id ? displayName(people, r.entry_user_id) : "",
          r.started_at ? new Date(r.started_at).toISOString() : "",
          r.ended_at ? new Date(r.ended_at).toISOString() : "",
          r.raw_minutes ?? "",
          r.rounded_minutes ?? "",
          r.rounding_delta_minutes ?? "",
          r.limit_override ? "Yes" : "",
          r.override_minutes ?? "",
          r.note ?? "",
          r.time_entry_id,
        ];
      });

      const parts = [from, to];
      if (actionFilter) parts.push(actionFilter);
      if (clientFilter) parts.push(clientList.find((c) => c.id === clientFilter)?.name ?? "client");
      if (taskFilter) parts.push(taskList.find((t) => t.id === taskFilter)?.title ?? "task");
      const baseName = `audit-trail-${parts.join("-")}`;
      if (format === "xlsx") {
        await downloadXlsxFile(`${baseName}.xlsx`, headers, dataRows);
      } else {
        downloadTextFile(`${baseName}.csv`, toCsv(headers, dataRows));
      }
      toast.success(
        `Exported ${filtered.length} audit ${filtered.length === 1 ? "event" : "events"} as ${format.toUpperCase()}`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Time report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hours bought, hours used, and what's left. Timers round up to 15-minute increments.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft md:w-auto">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="audit-from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[9.5rem]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="audit-to"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="w-[9.5rem]"
              />
            </div>
            {me.isStaff && (
              <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Action</Label>
              <Select value={action} onValueChange={(v) => setAction(v as AuditAction | "all")}>
                <SelectTrigger className="w-[9.5rem]">
                  <SelectValue placeholder="Any action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any action</SelectItem>
                  {AUDIT_ACTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
              </>
            )}
            {(me.isStaff || clientList.length > 1) && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Client</Label>
              <Select
                value={clientId}
                onValueChange={(v) => {
                  setClientId(v);
                  setTaskId("all");
                }}
              >
                <SelectTrigger className="w-[10rem]">
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {clientList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Task</Label>
              <Select value={taskId} onValueChange={(v) => setTaskId(v)}>
                <SelectTrigger className="w-[12rem]">
                  <SelectValue placeholder="All tasks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tasks</SelectItem>
                  {(tasks.data ?? [])
                    .filter((t) => !clientFilter || t.client_id === clientFilter)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setAction("all");
                  setClientId("all");
                  setTaskId("all");
                }}
              >
                Clear filters
              </Button>
            )}
            {me.isStaff && (
              <>
            <Button onClick={() => exportAudit("csv")} disabled={exporting !== null}>
              {exporting === "csv" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Download className="mr-2 size-4" />
              )}
              Audit CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => exportAudit("xlsx")}
              disabled={exporting !== null}
            >
              {exporting === "xlsx" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 size-4" />
              )}
              Audit XLSX
            </Button>
              </>
            )}
          </div>
          {me.isStaff && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                Time report{clientFilter
                  ? ` for ${clientList.find((c) => c.id === clientFilter)?.name ?? "client"}`
                  : " for all clients"}:
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportReport("csv", clientFilter)}
                disabled={exporting !== null}
              >
                {exporting === "report-csv" ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Download className="mr-2 size-4" />
                )}
                Report CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportReport("pdf", clientFilter)}
                disabled={exporting !== null}
              >
                {exporting === "report-pdf" ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 size-4" />
                )}
                Report PDF
              </Button>
            </div>
          )}
        </div>
      </div>



      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Weekly trend</h2>
            <p className="text-xs text-muted-foreground">
              Hours logged per week between {from} and {to}
                {clientFilter
                ? ` for ${clientList.find((c) => c.id === clientFilter)?.name ?? "client"}`
                : ""}
              {taskFilter
                ? ` on ${(tasks.data ?? []).find((t) => t.id === taskFilter)?.title ?? "task"}`
                : ""}
              .
            </p>
          </div>
          <p className="text-sm font-medium">{formatHours(totalRangeHours)} total</p>
        </div>
        {weekly.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No time logged in this date range yet.
          </p>
        ) : (
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickFormatter={(v: number) => `${v}h`}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    color: "var(--foreground)",
                    fontSize: 12,
                  }}
                  labelFormatter={(l: string) => `Week of ${l}`}
                  formatter={(v: number) => [formatHours(v), "Logged"]}
                />
                <Bar dataKey="hours" fill="var(--primary)" radius={[8, 8, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clientList.map((c) => {
          const b = computeBalance(c.id, clientList, credits.data ?? [], entries.data ?? []);
          const pct = b.bought > 0 ? Math.min(100, Math.max(0, (b.remaining / b.bought) * 100)) : 0;
          return (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{c.name}</h2>
                {b.remaining < 1 && (
                  <Badge className="bg-warning-soft text-warning-foreground">Low balance</Badge>
                )}
              </div>
              <p className="mt-2 text-3xl font-semibold">{formatHours(b.remaining)}</p>
              <p className="text-xs text-muted-foreground">remaining</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Stat label="Bought" value={formatHours(b.bought)} />
                <Stat label="Used" value={formatHours(b.used)} />
                <Stat label="Monthly retainer" value={formatHours(b.monthRetainer)} />
                <Stat label="Used this month" value={formatHours(b.monthUsed)} />
              </dl>
              {me.isStaff && (
                <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">Export {from} → {to}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => exportReport("csv", c.id)}
                    disabled={exporting !== null}
                  >
                    <Download className="mr-1.5 size-3.5" />
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => exportReport("pdf", c.id)}
                    disabled={exporting !== null}
                  >
                    <FileText className="mr-1.5 size-3.5" />
                    PDF
                  </Button>
                </div>
              )}
            </div>

          );
        })}
        {clientList.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No clients yet — add one on the Clients page.
          </p>
        )}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Detailed timeline</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every time entry grouped by client and task, with the measured duration, the 15-minute
        increment that was billed, and any remaining-hours override.
      </p>
      <div className="mt-4 space-y-4">
        {timeline.map((g) => (
          <section
            key={g.clientId ?? "none"}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
          >
            <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-muted px-4 py-3">
              <h3 className="font-semibold">{g.name}</h3>
              <Badge variant="secondary">{formatDuration(g.minutes)}</Badge>
              {g.overrides > 0 && (
                <Badge className="bg-warning-soft text-warning-foreground">
                  {g.overrides} override{g.overrides === 1 ? "" : "s"}
                </Badge>
              )}
              {me.isStaff && g.clientId && (
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => exportReport("csv", g.clientId)}
                    disabled={exporting !== null}
                  >
                    <Download className="mr-1.5 size-3.5" />
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => exportReport("pdf", g.clientId)}
                    disabled={exporting !== null}
                  >
                    <FileText className="mr-1.5 size-3.5" />
                    PDF
                  </Button>
                </div>
              )}
            </header>
            <div className="divide-y divide-border">
              {g.taskGroups.map((t) => (
                <div key={t.title + t.minutes} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.entries.length} entr{t.entries.length === 1 ? "y" : "ies"}
                    </span>
                    <span className="ml-auto text-sm font-medium">{formatDuration(t.minutes)}</span>
                  </div>
                  <ol className="mt-2 space-y-1.5 border-l border-border pl-4">
                    {t.entries.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {new Date(e.started_at).toLocaleString()}
                        </span>
                        {me.isStaff && (
                          <span className="text-muted-foreground">
                            · {displayName(profiles.data ?? [], e.user_id)}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          · measured {Math.round(rawMinutes(e))}m
                        </span>
                        <Badge variant="outline">billed {formatDuration(e.minutes ?? 0)}</Badge>
                        {e.limit_override && (
                          <Badge className="bg-warning-soft text-warning-foreground">
                            Override
                            {e.override_minutes
                              ? ` +${Math.round(Number(e.override_minutes))}m`
                              : ""}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        ))}
        {timeline.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No time logged for the selected filters yet.
          </p>
        )}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Logged time</h2>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left">Task</th>
              <th className="px-4 py-2.5 text-left">Client</th>
              {me.isStaff && <th className="px-4 py-2.5 text-left">Member</th>}
              <th className="px-4 py-2.5 text-left">Date</th>
              <th className="px-4 py-2.5 text-right">Logged</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogged.map((e) => {
              const task = (tasks.data ?? []).find((t) => t.id === e.task_id);
              return (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-4 py-2.5">{task?.title ?? "Task"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {clientList.find((c) => c.id === (task?.client_id ?? e.tasks?.client_id))?.name ?? "—"}
                  </td>
                  {me.isStaff && (
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {displayName(profiles.data ?? [], e.user_id)}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(e.started_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {formatDuration(e.minutes ?? 0)}
                  </td>
                </tr>
              );
            })}
            {filteredLogged.length === 0 && (
              <tr>
                <td colSpan={me.isStaff ? 5 : 4} className="px-4 py-8 text-center text-muted-foreground">
                  No time logged for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
