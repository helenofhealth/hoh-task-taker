import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { inviteClient } from "@/lib/invite-client.functions";
import { notifyTaskEvent } from "@/lib/task-notifications.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currentMonthStart, type Client, type Profile } from "@/lib/tracker";

const db = supabase as unknown as { from: (t: string) => any };

export function NewTaskDialog({
  clients,
  profiles,
  userId,
  defaultClientId,
}: {
  clients: Client[];
  profiles: Profile[];
  userId: string;
  defaultClientId?: string | undefined;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [ownerId, setOwnerId] = useState(userId);
  const [priority, setPriority] = useState("normal");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState("Weekly");
  const [showNewClient, setShowNewClient] = useState(false);
  const [ncName, setNcName] = useState("");
  const [ncBusiness, setNcBusiness] = useState("");
  const [ncEmail, setNcEmail] = useState("");
  const [ncPhone, setNcPhone] = useState("");
  const [ncHours, setNcHours] = useState("");
  const [ncKind, setNcKind] = useState("package");

  const createClient = useMutation({
    mutationFn: async () => {
      const clean = ncName.trim();
      if (!clean) throw new Error("Client name is required");
      const rawHours = ncHours.trim();
      const hours = rawHours === "" ? 0 : Number(rawHours);
      if (!Number.isFinite(hours) || hours < 0) throw new Error("Hours must be 0 or more");
      const { data, error } = await db
        .from("clients")
        .insert({
          name: clean,
          retainer_hours: ncKind === "retainer" ? hours : 0,
          business_name: ncBusiness.trim() || null,
          email: ncEmail.trim() || null,
          phone: ncPhone.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const created = data as { id: string };
      if (hours > 0) {
        const { error: creditError } = await db.from("hour_credits").insert({
          client_id: created.id,
          hours,
          kind: ncKind,
          effective_month: ncKind === "retainer" ? currentMonthStart() : null,
        });
      if (creditError) throw creditError;
      }
      const contactEmail = ncEmail.trim();
      if (contactEmail) {
        const result = await inviteClient({
          data: {
            clientId: created.id,
            email: contactEmail,
            name: clean,
            origin: window.location.origin,
          },
        });
        return { ...created, invited: result.invited };
      }
      return { ...created, invited: null as boolean | null };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setClientId(data.id);
      setShowNewClient(false);
      setNcName("");
      setNcBusiness("");
      setNcEmail("");
      setNcPhone("");
      setNcHours("");
      setNcKind("package");
      qc.invalidateQueries({ queryKey: ["credits"] });
      if (data.invited === true) toast.success("Client added — invitation email sent");
      else if (data.invited === false) toast.success("Client added — existing account linked");
      else toast.success("Client added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const notifyEvent = useServerFn(notifyTaskEvent);

  const create = useMutation({
    mutationFn: async () => {
      const clean = title.trim();
      if (!clean) throw new Error("Give the task a title");
      if (!clientId) throw new Error("Pick a client");
      const { data: created, error } = await db
        .from("tasks")
        .insert({
          title: clean,
          description: description.trim() || null,
          client_id: clientId,
          owner_id: ownerId || null,
          priority,
          start_date: startDate || null,
          due_date: dueDate || null,
          is_recurring: recurring,
          recurrence: recurring ? recurrence : null,
          created_by: userId,
          position: Date.now(),
        })
        .select("id")
        .single();
      if (error) throw error;
      if (ownerId && created) {
        notifyEvent({
          data: {
            taskId: created.id,
            kind: "created",
            ...(dueDate ? { detail: `due ${dueDate}` } : {}),
            origin: window.location.origin,
          },
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
      setTitle("");
      setDescription("");
      toast.success("Task created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1.5 size-4" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea
              id="t-desc"
              rows={4}
              value={description}
              maxLength={8000}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select
                value={clientId}
                onValueChange={(v) => {
                  if (v === "__new") {
                    setShowNewClient(true);
                    return;
                  }
                  setClientId(v);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  <SelectItem value="__new">+ Add a new client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger><SelectValue placeholder="Assign someone" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low", "normal", "high", "urgent"].map((p) => (
                    <SelectItem key={p} value={p}>{p[0]!.toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-start">Start date</Label>
              <Input id="t-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due">End date</Label>
              <Input id="t-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Recurring</Label>
              <div className="flex h-9 items-center gap-3">
                <Switch checked={recurring} onCheckedChange={setRecurring} />
                {recurring && (
                  <Select value={recurrence} onValueChange={setRecurrence}>
                    <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Daily", "Weekly", "Bi-weekly", "Monthly", "Quarterly"].map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
          {showNewClient && (
            <div className="rounded-xl border border-border bg-surface-muted/60 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">New client</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowNewClient(false)}>
                  Cancel
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nc-name">Name</Label>
                  <Input id="nc-name" value={ncName} maxLength={120} onChange={(e) => setNcName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nc-business">Business name — optional</Label>
                  <Input
                    id="nc-business"
                    value={ncBusiness}
                    maxLength={160}
                    placeholder="Optional"
                    onChange={(e) => setNcBusiness(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nc-email">Email — optional</Label>
                  <Input
                    id="nc-email"
                    type="email"
                    value={ncEmail}
                    maxLength={200}
                    placeholder="Optional"
                    onChange={(e) => setNcEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nc-phone">Phone — optional</Label>
                  <Input
                    id="nc-phone"
                    type="tel"
                    value={ncPhone}
                    maxLength={40}
                    placeholder="Optional"
                    onChange={(e) => setNcPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nc-hours">Hours bought — optional</Label>
                  <Input
                    id="nc-hours"
                    type="number"
                    min="0"
                    step="0.25"
                    value={ncHours}
                    placeholder="Optional"
                    onChange={(e) => setNcHours(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Hours type</Label>
                  <Select value={ncKind} onValueChange={setNcKind}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="package">Hour block</SelectItem>
                      <SelectItem value="retainer">Monthly retainer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => createClient.mutate()}
                disabled={createClient.isPending}
              >
                <Plus className="mr-1.5 size-4" /> Save client
              </Button>
            </div>
          )}
          <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>
            Create task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
