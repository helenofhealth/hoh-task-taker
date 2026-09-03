import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/hooks/useAuth";
import {
  computeBalance,
  downloadTextFile,
  fetchClients,
  fetchCredits,
  fetchTasks,
  fetchTimeEntries,
  formatHours,
  toCsv,
} from "@/lib/tracker";

const TITLE = "Client usage report — Helen of Health Task Taker";
const DESCRIPTION =
  "See which clients are active: tasks picked, hours logged and credits used per client, with CSV export.";

export const Route = createFileRoute("/_authenticated/usage-report")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsageReportPage,
});

type SortKey = "name" | "tasks" | "hours" | "used" | "remaining";

function UsageReportPage() {
  const me = useMe();
  const clients = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const entries = useQuery({ queryKey: ["time-entries"], queryFn: fetchTimeEntries });
  const credits = useQuery({ queryKey: ["credits"], queryFn: fetchCredits });

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("hours");

  const rows = useMemo(() => {
    const clientList = clients.data ?? [];
    const taskList = tasks.data ?? [];
    const entryList = entries.data ?? [];

    const minutesByClient = new Map<string, { total: number; billable: number; free: number }>();
    for (const e of entryList) {
      const cid = e.tasks?.client_id;
      if (!cid || !e.minutes) continue;
      const cur = minutesByClient.get(cid) ?? { total: 0, billable: 0, free: 0 };
      cur.total += e.minutes;
      if (e.billable) cur.billable += e.minutes;
      else cur.free += e.minutes;
      minutesByClient.set(cid, cur);
    }

    const lastActivity = new Map<string, string>();
    for (const e of entryList) {
      const cid = e.tasks?.client_id;
      if (!cid) continue;
      const at = e.ended_at ?? e.started_at;
      if (!lastActivity.get(cid) || at > lastActivity.get(cid)!) lastActivity.set(cid, at);
    }

    return clientList.map((c) => {
      const clientTasks = taskList.filter((t) => t.client_id === c.id);
      const mins = minutesByClient.get(c.id) ?? { total: 0, billable: 0, free: 0 };
      const balance = computeBalance(c.id, clientList, credits.data ?? [], entryList);
      return {
        id: c.id,
        name: c.business_name || c.name,
        tasksPicked: clientTasks.length,
        tasksRequested: clientTasks.filter((t) => t.source === "client_request").length,
        openTasks: clientTasks.filter((t) => t.status !== "completed").length,
        completedTasks: clientTasks.filter((t) => t.status === "completed").length,
        hours: mins.total / 60,
        billableHours: mins.billable / 60,
        freeHours: mins.free / 60,
        creditsBought: balance.bought,
        creditsUsed: balance.used,
        creditsRemaining: balance.remaining,
        creditsExpired: balance.expired,
        lastActivity: lastActivity.get(c.id)?.slice(0, 10) ?? null,
      };
    });
  }, [clients.data, tasks.data, entries.data, credits.data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "tasks":
          return b.tasksPicked - a.tasksPicked;
        case "used":
          return b.creditsUsed - a.creditsUsed;
        case "remaining":
          return b.creditsRemaining - a.creditsRemaining;
        default:
          return b.hours - a.hours;
      }
    });
    return sorted;
  }, [rows, search, sort]);

  const totals = useMemo(
    () =>
      visible.reduce(
        (acc, r) => ({
          tasks: acc.tasks + r.tasksPicked,
          hours: acc.hours + r.hours,
          used: acc.used + r.creditsUsed,
          remaining: acc.remaining + r.creditsRemaining,
          active: acc.active + (r.hours > 0 || r.openTasks > 0 ? 1 : 0),
        }),
        { tasks: 0, hours: 0, used: 0, remaining: 0, active: 0 },
      ),
    [visible],
  );

  function exportCsv() {
    const csv = toCsv(
      [
        "Client",
        "Tasks picked",
        "Client requests",
        "Open",
        "Completed",
        "Hours logged",
        "Billable hours",
        "Free hours",
        "Credits purchased",
        "Credits used",
        "Credits remaining",
        "Credits expired",
        "Last activity",
      ],
      visible.map((r) => [
        r.name,
        r.tasksPicked,
        r.tasksRequested,
        r.openTasks,
        r.completedTasks,
        r.hours.toFixed(2),
        r.billableHours.toFixed(2),
        r.freeHours.toFixed(2),
        r.creditsBought.toFixed(2),
        r.creditsUsed.toFixed(2),
        r.creditsRemaining.toFixed(2),
        r.creditsExpired.toFixed(2),
        r.lastActivity ?? "",
      ]),
    );
    downloadTextFile(`client-usage-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (!me.isStaff) {
    return (
      <AppShell>
        <p className="mt-8 text-sm text-muted-foreground">
          This report is only available to the Helen of Health team.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Client usage report</h1>
          <p className="text-sm text-muted-foreground">
            Tasks picked, hours logged and credits used per client — so you can see who is active.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client"
            className="w-48"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hours">Most hours logged</SelectItem>
              <SelectItem value="tasks">Most tasks picked</SelectItem>
              <SelectItem value="used">Most credits used</SelectItem>
              <SelectItem value="remaining">Most credits left</SelectItem>
              <SelectItem value="name">Client name</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active clients" value={`${totals.active} of ${visible.length}`} />
        <Stat label="Tasks picked" value={String(totals.tasks)} />
        <Stat label="Hours logged" value={formatHours(totals.hours)} />
        <Stat
          label="Credits used"
          value={formatHours(totals.used)}
          hint={`${formatHours(totals.remaining)} still available`}
        />
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Client</th>
              <th className="px-4 py-3 text-right font-medium">Tasks picked</th>
              <th className="px-4 py-3 text-right font-medium">Open / done</th>
              <th className="px-4 py-3 text-right font-medium">Hours logged</th>
              <th className="px-4 py-3 text-right font-medium">Credits used</th>
              <th className="px-4 py-3 text-right font-medium">Credits left</th>
              <th className="px-4 py-3 text-left font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.name}</p>
                  {r.tasksRequested > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {r.tasksRequested} picked by the client
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{r.tasksPicked}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {r.openTasks} / {r.completedTasks}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatHours(r.hours)}
                  {r.freeHours > 0.0001 && (
                    <span className="block text-xs text-muted-foreground">
                      {formatHours(r.freeHours)} free
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatHours(r.creditsUsed)}
                  <span className="block text-xs text-muted-foreground">
                    of {formatHours(r.creditsBought)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{formatHours(r.creditsRemaining)}</td>
                <td className="px-4 py-3">
                  {r.lastActivity ? (
                    r.lastActivity
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      no time logged
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  No clients match that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
