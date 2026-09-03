import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, Clock, Inbox, Library, Pencil, Plus, Search, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/hooks/useAuth";
import { fetchClients, fetchProvenTasks, type ProvenTask } from "@/lib/tracker";
import { assignProvenTaskToClient } from "@/lib/assign-proven-task.functions";

const db = supabase as unknown as { from: (t: string) => any };

const TITLE = "Proven tasks library — Helen of Health Task Taker";
const DESCRIPTION =
  "Ready-made GoHighLevel tasks clients can pick from — each with subtasks, deliverables, a QC checklist and hours estimate.";

export const Route = createFileRoute("/_authenticated/proven-tasks")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProvenTasksPage,
});

interface DraftState {
  id: string | null;
  title: string;
  category: string;
  description: string;
  subtasks: string;
  deliverables: string;
  qc: string;
  estimated: string;
  clientId: string;
}

const SHARED = "shared";

const EMPTY_DRAFT: DraftState = {
  id: null,
  title: "",
  category: "",
  description: "",
  subtasks: "",
  deliverables: "",
  qc: "",
  estimated: "",
  clientId: SHARED,
};

const toLines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function ProvenTasksPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [agency, setAgency] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const navigate = useNavigate();

  // "Send to client" state
  const [sendTask, setSendTask] = useState<ProvenTask | null>(null);
  const [sendClientId, setSendClientId] = useState("");
  const [sendDue, setSendDue] = useState("");
  const [sendSubAccount, setSendSubAccount] = useState("");
  const [sendPriority, setSendPriority] = useState("normal");

  const library = useQuery({ queryKey: ["proven_tasks"], queryFn: fetchProvenTasks });
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: fetchClients,
    
  });
  const assign = useServerFn(assignProvenTaskToClient);

  const send = useMutation({
    mutationFn: async () => {
      if (!sendTask) throw new Error("Pick a proven task");
      if (!sendClientId) throw new Error("Pick a client");
      return assign({
        data: {
          provenTaskId: sendTask.id,
          clientId: sendClientId,
          origin: window.location.origin,
          dueDate: sendDue || null,
          subAccount: sendSubAccount || null,
          priority: sendPriority,
        },
      });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      if (res.ghl.pushed) {
        toast.success(
          res.ghl.ownAgency
            ? "Task added to the client's portal and their own GoHighLevel agency"
            : "Task added to the client's portal and synced to GoHighLevel",
        );
      } else {
        toast.success("Task added to the client's portal", {
          description: res.ghl.error ?? undefined,
        });
      }
      const taskId = res.taskId;
      setSendTask(null);
      setSendClientId("");
      setSendDue("");
      setSendSubAccount("");
      setSendPriority("normal");
      void navigate({ to: "/board", search: { task: taskId } as never });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const categories = useMemo(
    () => [...new Set((library.data ?? []).map((t) => t.category))].sort(),
    [library.data],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (library.data ?? [])
      .filter((t) => (showArchived ? t.status === "archived" : t.status !== "archived"))
      .filter((t) => category === "all" || t.category === category)
      .filter(
        (t) =>
          !q ||
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q),
      );
  }, [library.data, search, category, showArchived]);

  const drafts = (library.data ?? []).filter((t) => t.status === "draft");

  const save = useMutation({
    mutationFn: async (d: DraftState) => {
      const est = d.estimated.trim() === "" ? null : Number(d.estimated);
      if (!d.title.trim()) throw new Error("Title is required");
      if (!d.category.trim()) throw new Error("Category is required");
      if (est !== null && (!Number.isFinite(est) || est < 0)) {
        throw new Error("Estimated hours must be 0 or more");
      }
      const row = {
        title: d.title.trim(),
        category: d.category.trim(),
        description: d.description.trim() || null,
        subtasks: toLines(d.subtasks),
        deliverables: toLines(d.deliverables),
        qc_checklist: toLines(d.qc),
        estimated_hours: est,
      };
      if (d.id) {
        const { error } = await db.from("proven_tasks").update(row).eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from("proven_tasks")
          .insert({ ...row, status: "active", is_system: false, created_by: me.userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Proven task saved");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["proven_tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from("proven_tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["proven_tasks"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!me.isStaff) {
    return (
      <AppShell>
        <p className="py-20 text-center text-muted-foreground">
          The proven tasks library is available to the team.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Library className="size-6 text-primary" /> Proven tasks
          </h1>
          <p className="text-sm text-muted-foreground">
            Ready-made GoHighLevel tasks clients can pick from — each with subtasks, deliverables, a QC checklist and hours estimate.
          </p>
        </div>
        <Button className="ml-auto" onClick={() => setDraft(EMPTY_DRAFT)}>
          <Plus className="mr-1.5 size-4" /> Add proven task
        </Button>
      </div>

      {drafts.length > 0 && !showArchived && (
        <div className="mb-5 rounded-2xl border border-warning/40 bg-warning-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Inbox className="size-4" /> {drafts.length} client suggestion
            {drafts.length === 1 ? "" : "s"} to review
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {drafts.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <span>{t.title}</span>
                <span className="text-xs text-muted-foreground">({t.category})</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-auto"
                  onClick={() => setStatus.mutate({ id: t.id, status: "active" })}
                >
                  Publish
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setStatus.mutate({ id: t.id, status: "archived" })}
                >
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the library"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? "Show active" : "Show archived"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t) => (
          <div
            key={t.id}
            className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{t.title}</p>
              {t.estimated_hours != null && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" /> ~{t.estimated_hours}h
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.category}
              {t.status === "draft" && " · suggestion"}
            </p>
            {t.description && (
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{t.description}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {t.subtasks.length} subtasks · {t.deliverables.length} deliverables ·{" "}
              {t.qc_checklist.length} QC checks
            </p>
            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              {t.status !== "archived" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setSendTask(t);
                    setSendClientId("");
                    setSendDue("");
                    setSendSubAccount("");
                    setSendPriority("normal");
                  }}
                >
                  <Send className="mr-1 size-3.5" /> Send to client
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setDraft({
                    id: t.id,
                    title: t.title,
                    category: t.category,
                    description: t.description ?? "",
                    subtasks: t.subtasks.join("\n"),
                    deliverables: t.deliverables.join("\n"),
                    qc: t.qc_checklist.join("\n"),
                    estimated: t.estimated_hours != null ? String(t.estimated_hours) : "",
                  })
                }
              >
                <Pencil className="mr-1 size-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setStatus.mutate({
                    id: t.id,
                    status: t.status === "archived" ? "active" : "archived",
                  })
                }
              >
                <Archive className="mr-1 size-3.5" />
                {t.status === "archived" ? "Restore" : "Archive"}
              </Button>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="py-10 text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
            {library.isLoading ? "Loading…" : "Nothing here yet."}
          </p>
        )}
      </div>

      <Dialog open={!!sendTask} onOpenChange={(v) => !v && setSendTask(null)}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send to a client's portal</DialogTitle>
          </DialogHeader>
          {sendTask && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                “{sendTask.title}” will be created as a real task in the client's board with its{" "}
                {sendTask.subtasks.length} subtasks, {sendTask.deliverables.length} deliverables and{" "}
                {sendTask.qc_checklist.length} QC checks, then synced to GoHighLevel.
              </p>
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={sendClientId} onValueChange={setSendClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder={clients.isLoading ? "Loading…" : "Pick a client"} />
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Due date (optional)</Label>
                  <Input
                    type="date"
                    value={sendDue}
                    onChange={(e) => setSendDue(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={sendPriority} onValueChange={setSendPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>GoHighLevel sub-account (optional)</Label>
                <Input
                  value={sendSubAccount}
                  onChange={(e) => setSendSubAccount(e.target.value)}
                  placeholder="Exact sub-account name"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSendTask(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={!sendClientId || send.isPending}
                  onClick={() => send.mutate()}
                >
                  {send.isPending ? "Sending…" : "Send to client"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit proven task" : "Add proven task"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    value={draft.title}
                    maxLength={200}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Input
                    value={draft.category}
                    maxLength={80}
                    list="proven-categories"
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  />
                  <datalist id="proven-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Subtasks — one per line</Label>
                <Textarea
                  rows={5}
                  value={draft.subtasks}
                  onChange={(e) => setDraft({ ...draft, subtasks: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Deliverables — one per line</Label>
                <Textarea
                  rows={3}
                  value={draft.deliverables}
                  onChange={(e) => setDraft({ ...draft, deliverables: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>QC checklist — one per line</Label>
                <Textarea
                  rows={3}
                  value={draft.qc}
                  onChange={(e) => setDraft({ ...draft, qc: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Estimated hours</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={draft.estimated}
                  onChange={(e) => setDraft({ ...draft, estimated: e.target.value })}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => save.mutate(draft)}
                disabled={save.isPending}
              >
                Save proven task
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
