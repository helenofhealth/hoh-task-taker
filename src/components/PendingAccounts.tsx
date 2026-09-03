import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import {
  assignAccountRole,
  listPendingAccounts,
  type PendingAccount,
} from "@/lib/pending-accounts.functions";
import { fetchClients } from "@/lib/tracker";

type Role = "admin" | "member" | "client";

interface RowState {
  role: Role;
  clientId: string;
  hourlyRate: string;
}

export function PendingAccounts() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingAccounts);
  const assignFn = useServerFn(assignAccountRole);
  const [state, setState] = useState<Record<string, RowState>>({});

  const pending = useQuery({ queryKey: ["pending-accounts"], queryFn: () => listFn() });
  const clients = useQuery({ queryKey: ["clients"], queryFn: fetchClients });

  const rowFor = (id: string): RowState =>
    state[id] ?? { role: "client", clientId: "", hourlyRate: "" };

  const assign = useMutation({
    mutationFn: async (account: PendingAccount) => {
      const row = rowFor(account.userId);
      await assignFn({
        data: {
          userId: account.userId,
          role: row.role,
          clientId: row.role === "client" ? row.clientId || undefined : undefined,
          hourlyRate: row.hourlyRate.trim() === "" ? 0 : Number(row.hourlyRate),
        },
      });
    },
    onSuccess: () => {
      toast.success("Access granted");
      qc.invalidateQueries({ queryKey: ["pending-accounts"] });
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accounts = pending.data ?? [];

  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserPlus className="size-5 text-primary" /> Pending access
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          New sign-ups (including Google accounts) with no role yet. Assign a role and link clients
          to their workspace.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {pending.isLoading ? (
          <p className="px-5 py-8 text-center text-muted-foreground">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="px-5 py-8 text-center text-muted-foreground">
            No accounts are waiting for access.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {accounts.map((a) => {
              const row = rowFor(a.userId);
              const set = (patch: Partial<RowState>) =>
                setState((s) => ({ ...s, [a.userId]: { ...row, ...patch } }));
              return (
                <li key={a.userId} className="px-5 py-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-48 flex-1">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-sm text-muted-foreground">{a.email || "—"}</p>
                      <Badge variant="secondary" className="mt-1 capitalize">
                        {a.provider}
                      </Badge>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Role</Label>
                      <Select value={row.role} onValueChange={(v) => set({ role: v as Role })}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="client">Client</SelectItem>
                          <SelectItem value="member">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {row.role === "client" ? (
                      <div className="space-y-1.5">
                        <Label>Client</Label>
                        <Select
                          value={row.clientId}
                          onValueChange={(v) => set({ clientId: v })}
                        >
                          <SelectTrigger className="w-52">
                            <SelectValue placeholder="Pick a client" />
                          </SelectTrigger>
                          <SelectContent>
                            {(clients.data ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label>Hourly rate (€)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-32"
                          value={row.hourlyRate}
                          onChange={(e) => set({ hourlyRate: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                    )}

                    <Button
                      onClick={() => assign.mutate(a)}
                      disabled={
                        assign.isPending || (row.role === "client" && !row.clientId)
                      }
                    >
                      {assign.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Grant access
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
