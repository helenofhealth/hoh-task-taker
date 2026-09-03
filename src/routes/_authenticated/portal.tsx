import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { CreditTimeline } from "@/components/CreditTimeline";
import { RequestTaskDialog } from "@/components/RequestTaskDialog";
import { TaskDialog } from "@/components/TaskDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { claimMyClientAccount } from "@/lib/self-link.functions";
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
  expiryLabel,
  fetchClients,
  fetchCredits,
  fetchFollowers,
  fetchOwners,
  fetchProfiles,
  fetchTasks,
  fetchTimeEntries,
  formatHours,
  type Task,
} from "@/lib/tracker";

const TITLE = "Client portal — Helen of Health Task Taker";
const DESCRIPTION =
  "See your own tasks, the time logged against them and how many purchased hours you have left — no need to ask the team.";

export const Route = createFileRoute("/_authenticated/portal")({
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
  component: PortalPage,
});

function PortalPage() {
  const me = useMe();
  const clients = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const entries = useQuery({ queryKey: ["time-entries"], queryFn: fetchTimeEntries });
  const credits = useQuery({ queryKey: ["credits"], queryFn: fetchCredits });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const followers = useQuery({ queryKey: ["followers"], queryFn: fetchFollowers });
  const owners = useQuery({ queryKey: ["owners"], queryFn: fetchOwners });

  const clientList = clients.data ?? [];
  const myClientId = me.profile?.client_id ?? null;
  // Staff can preview any client's portal; a client only ever sees their own.
  const [preview, setPreview] = useState<string>("");
  const clientId = me.isStaff ? preview || (clientList[0]?.id ?? null) : myClientId;
  const client = clientList.find((c) => c.id === clientId) ?? null;

  const [openTask, setOpenTask] = useState<Task | null>(null);

  const queryClient = useQueryClient();
  const claimAccount = useServerFn(claimMyClientAccount);
  const [claiming, setClaiming] = useState(false);

  async function claim() {
    setClaiming(true);
    try {
      const result = await claimAccount({});
      if (!result.ok) {
        toast.error(result.message ?? "We could not connect your account");
        return;
      }
      toast.success(`Connected to ${result.clientName}`);
      await queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We could not connect your account");
    } finally {
      setClaiming(false);
    }
  }

  const myTasks = useMemo(
    () => (tasks.data ?? []).filter((t) => t.client_id && t.client_id === clientId),
    [tasks.data, clientId],
  );

  const minutesByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries.data ?? []) {
      if (!e.minutes) continue;
      map.set(e.task_id, (map.get(e.task_id) ?? 0) + e.minutes);
    }
    return map;
  }, [entries.data]);

  const balance = client
    ? computeBalance(client.id, clientList, credits.data ?? [], entries.data ?? [])
    : null;

  const totalMinutes = myTasks.reduce((s, t) => s + (minutesByTask.get(t.id) ?? 0), 0);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {client ? client.business_name || client.name : "Client portal"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Your tasks, the time we logged and the hours you have left.
          </p>
        </div>
        {me.isStaff && clientList.length > 0 && (
          <div className="ml-auto">
            <Select value={clientId ?? ""} onValueChange={setPreview}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Preview a client" />
              </SelectTrigger>
              <SelectContent>
                {clientList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!me.isStaff && client && (
          <div className="ml-auto">
            <RequestTaskDialog client={client} userId={me.userId ?? ""} balance={balance} />
          </div>
        )}
      </div>

      {!client ? (
        <div className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <p className="text-sm text-muted-foreground">
            Your login is not connected to a client workspace yet. If you were onboarded with this
            email address, you can connect it yourself right now.
          </p>
          <Button onClick={claim} disabled={claiming}>
            {claiming && <Loader2 className="mr-2 size-4 animate-spin" />}
            Connect my account
          </Button>
          <p className="text-xs text-muted-foreground">
            No match found? Contact the Helen of Health team and they will connect it for you.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Hours remaining"
              value={formatHours(balance?.remaining ?? 0)}
              hint={
                balance && balance.remainingFree > 0.0001
                  ? `${formatHours(balance.remaining - balance.remainingFree)} billable · ${formatHours(balance.remainingFree)} free`
                  : "still usable today"
              }
            />
            <Stat
              label="Hours purchased"
              value={formatHours(balance?.bought ?? 0)}
              hint={`${formatHours(balance?.used ?? 0)} used so far`}
            />
            <Stat
              label="Next expiry"
              value={balance?.nextExpiry ?? "—"}
              hint={
                balance?.nextExpiry
                  ? `${formatHours(balance.expiringHours)} expiring ${expiryLabel(balance.expiresInDays)}`
                  : "nothing pending expiry"
              }
            />
            <Stat
              label="Open tasks"
              value={String(myTasks.filter((t) => t.status !== "completed").length)}
              hint={`${formatHours(totalMinutes / 60)} logged in total`}
            />
          </div>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Your tasks</h2>
            <p className="text-xs text-muted-foreground">
              Open a task to read its details and add a comment for the team.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {STATUSES.map((col) => {
                const items = myTasks.filter((t) => t.status === col.key);
                if (items.length === 0) return null;
                return (
                  <div
                    key={col.key}
                    className="rounded-2xl border border-border bg-surface-muted p-4"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className={`size-2.5 rounded-full ${col.token}`} />
                      <h3 className="text-sm font-semibold">{col.label}</h3>
                      <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {items.length}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {items.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => setOpenTask(t)}
                            className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-soft transition-colors hover:border-primary/40 hover:bg-accent"
                          >
                            <p className="text-sm font-medium">{t.title}</p>
                            {t.project && (
                              <p className="text-xs text-muted-foreground">{t.project}</p>
                            )}
                            <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="size-3" />
                                {formatHours((minutesByTask.get(t.id) ?? 0) / 60)}
                              </span>
                              {t.due_date && (
                                <span className="flex items-center gap-1">
                                  <CalendarClock className="size-3" />
                                  due {t.due_date}
                                </span>
                              )}
                              <Badge variant="outline" className="ml-auto text-[10px]">
                                {t.priority}
                              </Badge>
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {myTasks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No tasks yet — the team will add them here as work starts.
                </p>
              )}
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="text-lg font-semibold">Your hours timeline</h2>
            <p className="text-xs text-muted-foreground">
              Hour blocks are valid for 3 months; monthly retainer hours do not roll over.
            </p>
            <div className="mt-4">
              <CreditTimeline
                clientId={client.id}
                credits={credits.data ?? []}
                entries={entries.data ?? []}
              />
            </div>
          </section>
        </>
      )}

      <TaskDialog
        task={openTask ? myTasks.find((t) => t.id === openTask.id) ?? openTask : null}
        open={!!openTask}
        onClose={() => setOpenTask(null)}
        profiles={profiles.data ?? []}
        clients={clientList}
        followers={followers.data ?? []}
        owners={owners.data ?? []}
        entries={entries.data ?? []}
        userId={me.userId ?? ""}
        canEdit={me.isStaff}
      />
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
