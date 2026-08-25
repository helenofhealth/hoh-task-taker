import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayName, useMe } from "@/hooks/useAuth";
import {
  computeBalance,
  downloadTextFile,
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

export const Route = createFileRoute("/_authenticated/time-report")({
  head: () => ({
    meta: [
      { title: "Time report — Bloom task tracker" },
      {
        name: "description",
        content:
          "See hours bought, hours used and remaining balance per client, plus every logged time entry.",
      },
      { property: "og:title", content: "Time report — Bloom task tracker" },
      {
        property: "og:description",
        content: "Client hour balances and a full log of time tracked in 15-minute increments.",
      },
    ],
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
  const logged = (entries.data ?? []).filter((e) => e.minutes);

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(isoDay(monthStart));
  const [to, setTo] = useState(isoDay(today));
  const [exporting, setExporting] = useState(false);

  const exportAudit = async () => {
    if (from > to) {
      toast.error("Start date must be before the end date");
      return;
    }
    setExporting(true);
    try {
      const rows = await fetchTimeAuditRange(from, to);
      if (rows.length === 0) {
        toast.error("No audit activity in that date range");
        return;
      }
      const taskList = tasks.data ?? [];
      const people = profiles.data ?? [];
      const csv = toCsv(
        [
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
          "Note",
          "Time entry ID",
        ],
        rows.map((r) => {
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
            r.note ?? "",
            r.time_entry_id,
          ];
        }),
      );
      downloadTextFile(`audit-trail-${from}-to-${to}.csv`, csv);
      toast.success(`Exported ${rows.length} audit ${rows.length === 1 ? "event" : "events"}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
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
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft">
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
          <Button onClick={exportAudit} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Export audit
          </Button>
        </div>
      </div>


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
            </div>
          );
        })}
        {clientList.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No clients yet — add one on the Clients page.
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
            {logged.map((e) => {
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
            {logged.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No time logged yet.
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
