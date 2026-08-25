import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { displayName, useMe } from "@/hooks/useAuth";
import {
  computeBalance,
  fetchClients,
  fetchCredits,
  fetchProfiles,
  fetchTasks,
  fetchTimeEntries,
  formatDuration,
  formatHours,
} from "@/lib/tracker";

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

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Time report</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Hours bought, hours used, and what's left. Timers round up to 15-minute increments.
      </p>

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
