import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { inviteClient } from "@/lib/invite-client.functions";
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
import { useMe } from "@/hooks/useAuth";
import {
  computeBalance,
  currentMonthStart,
  fetchClients,
  fetchCredits,
  fetchTimeEntries,
  formatHours,
} from "@/lib/tracker";
import type { Client } from "@/lib/tracker";

const db = supabase as unknown as { from: (t: string) => any };

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients & hours — Helen of Health Task Taker" },
      {
        name: "description",
        content: "Manage clients, monthly retainers and purchased hour packages in one place.",
      },
      { property: "og:title", content: "Clients & hours — Helen of Health Task Taker" },
      {
        property: "og:description",
        content: "Add clients, set retainers and top up hour packages.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tasks.helenofhealth.com/clients" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://tasks.helenofhealth.com/clients" }],
  }),

  component: ClientsPage,
});

function ClientsPage() {
  const me = useMe();

  if (!me.isStaff) {
    return (
      <AppShell>
        <p className="text-muted-foreground">Only team members can view this page.</p>
      </AppShell>
    );
  }

  return <StaffClientsPage />;
}

function StaffClientsPage() {
  const qc = useQueryClient();
  const me = useMe();
  const clients = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const credits = useQuery({ queryKey: ["credits"], queryFn: fetchCredits });
  const entries = useQuery({ queryKey: ["time_entries"], queryFn: fetchTimeEntries });

  const [name, setName] = useState("");
  const [retainer, setRetainer] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [creditClient, setCreditClient] = useState("");
  const [creditHours, setCreditHours] = useState("10");
  const [creditKind, setCreditKind] = useState("package");

  const addClient = useMutation({
    mutationFn: async () => {
      const clean = name.trim();
      if (!clean) throw new Error("Client name is required");
      const raw = retainer.trim();
      const hours = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(hours) || hours < 0) throw new Error("Retainer must be 0 or more");
      const contactEmail = email.trim().toLowerCase();
      if (!contactEmail) throw new Error("Email is required");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Enter a valid email address");
      const { data, error } = await db
        .from("clients")
        .insert({
          name: clean,
          retainer_hours: hours,
          business_name: business.trim() || null,
          email: contactEmail,
          phone: phone.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const result = await inviteClient({
        data: {
          clientId: (data as { id: string }).id,
          email: contactEmail,
          name: clean,
          origin: window.location.origin,
        },
      });
      return { invited: result.invited };
    },
    onSuccess: (result) => {
      setName("");
      setRetainer("");
      setBusiness("");
      setEmail("");
      setPhone("");
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (result.invited === true) toast.success("Client added — invitation email sent");
      else if (result.invited === false) toast.success("Client added — existing account linked");
      else toast.success("Client added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendInvite = useMutation({
    mutationFn: async (client: { id: string; email: string; name: string }) => {
      await inviteClient({
        data: {
          clientId: client.id,
          email: client.email,
          name: client.name,
          origin: window.location.origin,
        },
      });
    },
    onSuccess: () => toast.success("Activation email sent"),
    onError: (e: Error) => toast.error(e.message),
  });

  const addCredit = useMutation({
    mutationFn: async () => {
      if (!creditClient) throw new Error("Pick a client");
      const hours = Number(creditHours);
      if (!Number.isFinite(hours) || hours <= 0) throw new Error("Hours must be greater than 0");
      const { error } = await db.from("hour_credits").insert({
        client_id: creditClient,
        hours,
        kind: creditKind,
        effective_month: creditKind === "retainer" ? currentMonthStart() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credits"] });
      toast.success("Hours added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clientList = clients.data ?? [];
  const [editing, setEditing] = useState<Client | null>(null);

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Clients & hours</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Set a monthly retainer, then top up with hour packages whenever a client buys more.
      </p>

      {me.isAdmin && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="font-semibold">Add a client</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Name</Label>
                <Input id="c-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-business">Business name — optional</Label>
                <Input
                  id="c-business"
                  value={business}
                  maxLength={160}
                  placeholder="Optional"
                  onChange={(e) => setBusiness(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={email}
                  maxLength={200}
                  placeholder="client@example.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  An activation email is sent automatically on save.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Phone — optional</Label>
                <Input
                  id="c-phone"
                  type="tel"
                  value={phone}
                  maxLength={40}
                  placeholder="Optional"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-retainer">Retainer (h/month) — optional</Label>
                <Input
                  id="c-retainer"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Optional"
                  value={retainer}
                  onChange={(e) => setRetainer(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => addClient.mutate()} disabled={addClient.isPending}>
                  <Plus className="mr-1.5 size-4" /> Add
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="font-semibold">Add hours</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px_140px_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={creditClient} onValueChange={setCreditClient}>
                  <SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
                  <SelectContent>
                    {clientList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-hours">Hours</Label>
                <Input
                  id="h-hours"
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={creditHours}
                  onChange={(e) => setCreditHours(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={creditKind} onValueChange={setCreditKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="package">Hour package</SelectItem>
                    <SelectItem value="retainer">Monthly retainer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => addCredit.mutate()} disabled={addCredit.isPending}>
                <Plus className="mr-1.5 size-4" /> Add
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left">Client</th>
              <th className="px-4 py-2.5 text-left">Contact</th>
              <th className="px-4 py-2.5 text-right">Retainer</th>
              <th className="px-4 py-2.5 text-right">Bought</th>
              <th className="px-4 py-2.5 text-right">Used</th>
              <th className="px-4 py-2.5 text-right">Remaining</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clientList.map((c) => {
              const b = computeBalance(c.id, clientList, credits.data ?? [], entries.data ?? []);
              return (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium">
                    {c.name}
                    {c.business_name && (
                      <span className="block text-xs font-normal text-muted-foreground">{c.business_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {c.email && <span className="block">{c.email}</span>}
                    {c.phone && <span className="block">{c.phone}</span>}
                    {!c.email && !c.phone && <span>—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {formatHours(Number(c.retainer_hours))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{formatHours(b.bought)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{formatHours(b.used)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${b.remaining < 1 ? "text-warning" : ""}`}>
                    {formatHours(b.remaining)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap justify-end gap-2">
                      {me.isAdmin && (
                        <Button variant="outline" size="sm" onClick={() => setEditing(c)}>
                          <Pencil className="mr-1.5 size-3.5" /> Edit
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={resendInvite.isPending}
                        onClick={() => resendInvite.mutate({ id: c.id, email: c.email, name: c.name })}
                      >
                        <Mail className="mr-1.5 size-3.5" /> Resend activation email
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {clientList.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No clients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditClientDialog client={editing} onClose={() => setEditing(null)} />
    </AppShell>
  );
}

function EditClientDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [retainer, setRetainer] = useState("");

  useEffect(() => {
    if (!client) return;
    setName(client.name ?? "");
    setBusiness(client.business_name ?? "");
    setEmail(client.email ?? "");
    setPhone(client.phone ?? "");
    setRetainer(String(Number(client.retainer_hours ?? 0)));
  }, [client]);

  const save = useMutation({
    mutationFn: async () => {
      if (!client) return;
      const clean = name.trim();
      if (!clean) throw new Error("Client name is required");
      const contactEmail = email.trim().toLowerCase();
      if (!contactEmail) throw new Error("Email is required");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Enter a valid email address");
      const raw = retainer.trim();
      const hours = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(hours) || hours < 0) throw new Error("Retainer must be 0 or more");
      const { error } = await db
        .from("clients")
        .update({
          name: clean,
          business_name: business.trim() || null,
          email: contactEmail,
          phone: phone.trim() || null,
          retainer_hours: hours,
        })
        .eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client updated");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="e-name">Name</Label>
            <Input id="e-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-business">Business name — optional</Label>
            <Input
              id="e-business"
              value={business}
              maxLength={160}
              placeholder="Optional"
              onChange={(e) => setBusiness(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-email">Email</Label>
            <Input
              id="e-email"
              type="email"
              value={email}
              maxLength={200}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-phone">Phone — optional</Label>
            <Input
              id="e-phone"
              type="tel"
              value={phone}
              maxLength={40}
              placeholder="Optional"
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-retainer">Retainer (h/month)</Label>
            <Input
              id="e-retainer"
              type="number"
              min="0"
              step="0.5"
              value={retainer}
              onChange={(e) => setRetainer(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
