import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { NewTaskDialog } from "@/components/NewTaskDialog";
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
  STATUSES,
  computeBalance,
  elapsedMinutes,
  fetchClients,
  fetchCredits,
  fetchFollowers,
  fetchProfiles,
  fetchTasks,
  fetchTimeEntries,
  formatHours,
  type Task,
  type TaskStatus,
} from "@/lib/tracker";

const db = supabase as unknown as { from: (t: string) => any };

export const Route = createFileRoute("/_authenticated/board")({
  head: () => ({
    meta: [
      { title: "Task board — Helen of Health Task Taker task tracker" },
      {
        name: "description",
        content:
          "Drag tasks through Requested, In Progress, Review and Completed while tracking billable time in 15-minute increments.",
      },
      { property: "og:title", content: "Task board — Helen of Health Task Taker task tracker" },
      {
        property: "og:description",
        content: "A friendlier kanban board with built-in time tracking and client hour balances.",
      },
    ],
  }),
  component: BoardPage,
});

function BoardPage() {
  const qc = useQueryClient();
  const me = useMe();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const tasks = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const clients = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const entries = useQuery({ queryKey: ["time_entries"], queryFn: fetchTimeEntries });
  const credits = useQuery({ queryKey: ["credits"], queryFn: fetchCredits });
  const followers = useQuery({ queryKey: ["followers"], queryFn: fetchFollowers });
  const commentRows = useQuery({
    queryKey: ["comment_counts"],
    queryFn: async () => {
      const { data, error } = await db.from("task_comments").select("task_id");
      if (error) throw error;
      return (data ?? []) as { task_id: string }[];
    },
  });

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await db.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const clientList = clients.data ?? [];
  const visibleClientIds =
    clientFilter === "all" ? clientList.map((c) => c.id) : [clientFilter];

  const balances = useMemo(
    () =>
      visibleClientIds.map((id) => ({
        client: clientList.find((c) => c.id === id)!,
        balance: computeBalance(id, clientList, credits.data ?? [], entries.data ?? []),
      })),
    [visibleClientIds.join(","), clientList, credits.data, entries.data],
  );

  const filtered = (tasks.data ?? []).filter((t) => {
    const matchesClient = clientFilter === "all" || t.client_id === clientFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      t.title.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q);
    return matchesClient && matchesSearch;
  });

  const minutesByTask = new Map<string, number>();
  const runningByTask = new Map<string, number>();
  for (const e of entries.data ?? []) {
    minutesByTask.set(e.task_id, (minutesByTask.get(e.task_id) ?? 0) + (e.minutes ?? 0));
    if (!e.ended_at) runningByTask.set(e.task_id, elapsedMinutes(e.started_at));
  }
  const commentsByTask = new Map<string, number>();
  for (const c of commentRows.data ?? [])
    commentsByTask.set(c.task_id, (commentsByTask.get(c.task_id) ?? 0) + 1);

  const lowBalance = balances.filter((b) => b.client && b.balance.remaining < 1);

  return (
    <AppShell
      actions={
        me.isStaff ? (
          <NewTaskDialog
            clients={clientList}
            profiles={profiles.data ?? []}
            userId={me.userId ?? ""}
          />
        ) : clientList.length ? (
          <NewTaskDialog
            clients={clientList}
            profiles={profiles.data ?? []}
            userId={me.userId ?? ""}
            defaultClientId={me.profile?.client_id ?? undefined}
          />
        ) : null
      }
    >
      {lowBalance.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4">
          <AlertTriangle className="mt-0.5 size-5 text-warning" />
          <p className="text-sm">
            <span className="font-semibold">Less than 1 hour remaining</span> for{" "}
            {lowBalance.map((b) => b.client.name).join(", ")}. Add hours now to keep the team working
            without a pause.
          </p>
        </div>
      )}

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks"
              className="pl-9"
            />
          </div>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {balances.slice(0, 4).map(({ client, balance }) =>
            client ? (
              <div key={client.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {client.name}
                </p>
                <p className="mt-1 text-2xl font-semibold">{formatHours(balance.remaining)}</p>
                <p className="text-xs text-muted-foreground">
                  remaining of {formatHours(balance.bought)} bought · {formatHours(balance.monthUsed)}{" "}
                  this month
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${
                        balance.bought > 0
                          ? Math.min(100, Math.max(0, (balance.remaining / balance.bought) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            ) : null,
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-4">
        {STATUSES.map((col) => {
          const items = filtered.filter((t) => t.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStatus(col.key);
              }}
              onDragLeave={() => setOverStatus((s) => (s === col.key ? null : s))}
              onDrop={() => {
                if (dragId) move.mutate({ id: dragId, status: col.key });
                setDragId(null);
                setOverStatus(null);
              }}
              className={`rounded-2xl border p-3 transition-colors ${
                overStatus === col.key
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-surface-muted"
              }`}
            >
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={`size-2.5 rounded-full ${col.token}`} />
                <h2 className="text-sm font-semibold">{col.label}</h2>
                <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2.5">
                {items.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    profiles={profiles.data ?? []}
                    clientName={clientList.find((c) => c.id === t.client_id)?.name}
                    trackedMinutes={minutesByTask.get(t.id) ?? 0}
                    commentCount={commentsByTask.get(t.id) ?? 0}
                    runningMinutes={runningByTask.get(t.id) ?? null}
                    onOpen={() => setOpenTask(t)}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    dragging={dragId === t.id}
                  />
                ))}
                {items.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                    Drop a task here
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TaskDialog
        task={openTask ? (tasks.data ?? []).find((t) => t.id === openTask.id) ?? openTask : null}
        open={!!openTask}
        onClose={() => setOpenTask(null)}
        profiles={profiles.data ?? []}
        clients={clientList}
        followers={followers.data ?? []}
        entries={entries.data ?? []}
        userId={me.userId ?? ""}
        canEdit={me.isStaff}
      />
    </AppShell>
  );
}
