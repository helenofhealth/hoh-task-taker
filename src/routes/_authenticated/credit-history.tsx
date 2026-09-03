import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/hooks/useAuth";
import {
  downloadTextFile,
  fetchClients,
  fetchCreditAudit,
  fetchProfiles,
  formatHours,
  toCsv,
} from "@/lib/tracker";
import type { HourCreditAuditRow } from "@/lib/tracker";

export const Route = createFileRoute("/_authenticated/credit-history")({
  head: () => ({
    meta: [
      { title: "Credit history — Helen of Health Task Taker" },
      {
        name: "description",
        content:
          "Trace every hour credit added, edited or removed so you can explain any change in a client's remaining hours.",
      },
      { property: "og:title", content: "Credit history — Helen of Health Task Taker" },
      {
        property: "og:description",
        content: "A full audit trail of hour credits per client.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tasks.helenofhealth.com/credit-history" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://tasks.helenofhealth.com/credit-history" }],
  }),
  component: CreditHistoryPage,
});

const ALL = "all";

function actionLabel(action: HourCreditAuditRow["action"]) {
  if (action === "added") return "Added";
  if (action === "edited") return "Edited";
  return "Removed";
}

function actionClass(action: HourCreditAuditRow["action"]) {
  if (action === "added") return "bg-status-completed/15 text-status-completed";
  if (action === "edited") return "bg-status-progress/15 text-status-progress";
  return "bg-status-hold/15 text-status-hold";
}

function kindLabel(kind: string | null) {
  if (!kind) return "—";
  return kind === "retainer" ? "Monthly retainer" : "Hour block";
}

function poolLabel(billable: boolean | null) {
  if (billable === null || billable === undefined) return "—";
  return billable ? "Billable" : "Free";
}

function hoursDelta(row: HourCreditAuditRow) {
  const before = row.previous_hours === null ? 0 : Number(row.previous_hours);
  const after = row.hours === null ? 0 : Number(row.hours);
  if (row.action === "added") return after;
  if (row.action === "removed") return -before;
  return after - before;
}

function CreditHistoryPage() {
  const me = useMe();
  const [clientId, setClientId] = useState<string>(ALL);
  const [action, setAction] = useState<string>(ALL);

  const auditQuery = useQuery({ queryKey: ["credit-audit"], queryFn: fetchCreditAudit, enabled: me.isStaff });
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: fetchClients, enabled: me.isStaff });
  const profilesQuery = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles, enabled: me.isStaff });

  const clientName = (id: string) =>
    clientsQuery.data?.find((c) => c.id === id)?.name ?? "Unknown client";
  const actorName = (id: string | null) => {
    if (!id) return "System";
    const p = profilesQuery.data?.find((x) => x.id === id);
    return p?.full_name || p?.email || "Unknown user";
  };

  const rows = useMemo(() => {
    const all = auditQuery.data ?? [];
    return all.filter(
      (r) =>
        (clientId === ALL || r.client_id === clientId) && (action === ALL || r.action === action),
    );
  }, [auditQuery.data, clientId, action]);

  const netChange = rows.reduce((sum, r) => sum + hoursDelta(r), 0);

  if (!me.isStaff) {
    return (
      <AppShell>
        <p className="text-muted-foreground">Only team members can view this page.</p>
      </AppShell>
    );
  }

  const exportCsv = () => {
    const csv = toCsv(
      [
        "When",
        "Client",
        "Action",
        "Change (h)",
        "Hours before",
        "Hours after",
        "Type",
        "Pool",
        "Effective month",
        "Expires",
        "Note",
        "By",
        "Credit ID",
      ],
      rows.map((r) => [
        new Date(r.created_at).toISOString(),
        clientName(r.client_id),
        actionLabel(r.action),
        hoursDelta(r).toFixed(2),
        r.previous_hours ?? "",
        r.hours ?? "",
        kindLabel(r.kind ?? r.previous_kind),
        poolLabel(r.billable ?? r.previous_billable),
        r.effective_month ?? "",
        r.expires_at ?? r.previous_expires_at ?? "",
        r.note ?? "",
        actorName(r.actor_id),
        r.credit_id,
      ]),
    );
    downloadTextFile(`credit-history-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Credit history</h1>
          <p className="text-sm text-muted-foreground">
            Every hour credit added, edited or removed — so you can trace exactly why a client&apos;s
            remaining hours changed.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="min-w-52 space-y-1.5">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All clients</SelectItem>
                {(clientsQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-40 space-y-1.5">
            <Label>Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All actions</SelectItem>
                <SelectItem value="added">Added</SelectItem>
                <SelectItem value="edited">Edited</SelectItem>
                <SelectItem value="removed">Removed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right text-sm">
              <div className="text-muted-foreground">Net change</div>
              <div className="font-semibold">
                {netChange >= 0 ? "+" : "−"}
                {formatHours(Math.abs(netChange))}
              </div>
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="mr-2 size-4" /> Export CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Change</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Pool</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">By</th>
              </tr>
            </thead>
            <tbody>
              {auditQuery.isLoading && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-muted-foreground">
                    Loading history…
                  </td>
                </tr>
              )}
              {!auditQuery.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-muted-foreground">
                    No credit changes recorded for this selection yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const delta = hoursDelta(r);
                return (
                  <tr key={r.id} className="border-t border-border/70 align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium">{clientName(r.client_id)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${actionClass(r.action)}`}
                      >
                        {actionLabel(r.action)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">
                      {delta === 0 ? "—" : `${delta > 0 ? "+" : "−"}${formatHours(Math.abs(delta))}`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {r.action === "edited"
                        ? `${formatHours(Number(r.previous_hours ?? 0))} → ${formatHours(Number(r.hours ?? 0))}`
                        : formatHours(Number(r.hours ?? r.previous_hours ?? 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {kindLabel(r.kind ?? r.previous_kind)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {poolLabel(r.billable ?? r.previous_billable)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {r.expires_at ?? r.previous_expires_at ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.note || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {actorName(r.actor_id)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
