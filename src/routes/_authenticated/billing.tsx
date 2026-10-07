import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/useAuth";
import { fetchClients, fetchTasks, fetchTimeEntries, formatHours } from "@/lib/tracker";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Client billing — Helen of Health Task Taker" },
      { name: "description", content: "Time logged per client and per task, split into billable and free hours, with the amount billed." },
      { property: "og:title", content: "Client billing — Helen of Health Task Taker" },
      { property: "og:description", content: "See how much each client is billed, task by task." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingPage,
});

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
const money = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(n);

type Agg = { billable: number; free: number };

function BillingPage() {
  const me = useMe();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [openClient, setOpenClient] = useState<string | null>(null);
  const entries = useQuery({ queryKey: ["time_entries"], queryFn: fetchTimeEntries });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const clients = useQuery({ queryKey: ["clients"], queryFn: fetchClients });

  const rows = useMemo(() => {
    const start = new Date(`${from}T00:00:00`).getTime();
    const end = new Date(`${to}T23:59:59`).getTime();
    const taskById = new Map((tasks.data ?? []).map((t) => [t.id, t]));
    const perClient = new Map<string, Agg & { tasks: Map<string, Agg> }>();
    for (const e of entries.data ?? []) {
      if (!e.minutes || !e.ended_at) continue;
      const at = new Date(e.started_at).getTime();
      if (at < start || at > end) continue;
      const clientId = e.tasks?.client_id ?? "none";
      const c = perClient.get(clientId) ?? { billable: 0, free: 0, tasks: new Map<string, Agg>() };
      const t = c.tasks.get(e.task_id) ?? { billable: 0, free: 0 };
      const key = e.billable === false ? "free" : "billable";
      c[key] += e.minutes;
      t[key] += e.minutes;
      c.tasks.set(e.task_id, t);
      perClient.set(clientId, c);
    }
    return [...perClient.entries()]
      .map(([id, agg]) => {
        const client = (clients.data ?? []).find((c) => c.id === id);
        const rate = Number(client?.hourly_rate ?? 0);
        return {
          id,
          name: client ? client.business_name || client.name : "No client",
          rate,
          ...agg,
          amount: (agg.billable / 60) * rate,
          taskRows: [...agg.tasks.entries()]
            .map(([taskId, a]) => ({ taskId, title: taskById.get(taskId)?.title ?? "Deleted task", ...a, amount: (a.billable / 60) * rate }))
            .sort((a, b) => b.billable + b.free - (a.billable + a.free)),
        };
      })
      .sort((a, b) => b.amount - a.amount || b.billable - a.billable);
  }, [entries.data, tasks.data, clients.data, from, to]);

  const totals = rows.reduce((s, r) => ({ billable: s.billable + r.billable, free: s.free + r.free, amount: s.amount + r.amount }), {
    billable: 0,
    free: 0,
    amount: 0,
  });

  if (me.roles.length > 0 && !me.isStaff) {
    return (
      <AppShell>
        <p className="text-muted-foreground">Only team members can view this page.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Client billing</h1>
            <p className="text-sm text-muted-foreground">Time logged per client and per task. Billed = billable hours × the client's hourly rate.</p>
          </div>
          <div className="flex gap-3">
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Billable time" value={formatHours(totals.billable / 60)} />
          <Stat label="Free time" value={formatHours(totals.free / 60)} />
          <Stat label="Total billed" value={money(totals.amount)} />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">Client / task</th>
                <th className="p-3 text-right">Billable</th>
                <th className="p-3 text-right">Free</th>
                <th className="p-3 text-right">Rate</th>
                <th className="p-3 text-right">Billed</th>
              </tr>
            </thead>
            <tbody>
              {(entries.isLoading || tasks.isLoading) && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!entries.isLoading && rows.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No time logged in this period.</td></tr>
              )}
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer border-b border-border hover:bg-muted/50" onClick={() => setOpenClient(openClient === r.id ? null : r.id)}>
                    <td className="p-3 font-medium">
                      <span className="flex items-center gap-1">
                        {openClient === r.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        {r.name}
                        <span className="text-xs font-normal text-muted-foreground">· {r.taskRows.length} task{r.taskRows.length === 1 ? "" : "s"}</span>
                      </span>
                    </td>
                    <td className="p-3 text-right">{formatHours(r.billable / 60)}</td>
                    <td className="p-3 text-right">{formatHours(r.free / 60)}</td>
                    <td className="p-3 text-right">{r.rate ? `${money(r.rate)}/h` : "—"}</td>
                    <td className="p-3 text-right font-semibold">{r.rate ? money(r.amount) : "—"}</td>
                  </tr>
                  {openClient === r.id &&
                    r.taskRows.map((t) => (
                      <tr key={t.taskId} className="border-b border-border bg-muted/30 text-muted-foreground">
                        <td className="p-2 pl-10">{t.title}</td>
                        <td className="p-2 text-right">{formatHours(t.billable / 60)}</td>
                        <td className="p-2 text-right">{formatHours(t.free / 60)}</td>
                        <td className="p-2" />
                        <td className="p-2 text-right">{r.rate ? money(t.amount) : "—"}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
