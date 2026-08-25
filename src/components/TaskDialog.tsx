import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { notifyTaskStatusChange } from "@/lib/task-notifications.functions";
import {
  AlertTriangle,
  Download,
  History,
  Loader2,
  Paperclip,
  Play,
  Square,
  Trash2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { displayName } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  STATUSES,
  computeBalance,
  elapsedMinutes,
  fetchCredits,
  formatHours,
  fetchAttachments,
  fetchComments,
  fetchTimeAudit,
  formatClock,
  formatDuration,
  roundedPreview,
  startTimer,
  stopTimer,
  type Client,
  type Profile,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TimeEntry,
} from "@/lib/tracker";

const db = supabase as unknown as { from: (t: string) => any };

interface Props {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  profiles: Profile[];
  clients: Client[];
  followers: { task_id: string; user_id: string }[];
  entries: TimeEntry[];
  userId: string;
  canEdit: boolean;
}

export function TaskDialog({
  task,
  open,
  onClose,
  profiles,
  clients,
  followers,
  entries,
  userId,
  canEdit,
}: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Task | null>(task);
  const [comment, setComment] = useState("");
  const [tick, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [overrunOpen, setOverrunOpen] = useState(false);

  useEffect(() => setDraft(task), [task]);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);


  const taskEntries = useMemo(
    () => entries.filter((e) => e.task_id === task?.id),
    [entries, task?.id],
  );
  const running = taskEntries.find((e) => !e.ended_at && e.user_id === userId);
  const totalMinutes = taskEntries.reduce((s, e) => s + (e.minutes ?? 0), 0);

  const comments = useQuery({
    queryKey: ["comments", task?.id],
    queryFn: () => fetchComments(task!.id),
    enabled: !!task && open,
  });
  const attachments = useQuery({
    queryKey: ["attachments", task?.id],
    queryFn: () => fetchAttachments(task!.id),
    enabled: !!task && open,
  });

  const audit = useQuery({
    queryKey: ["time_audit", task?.id],
    queryFn: () => fetchTimeAudit(task!.id),
    enabled: !!task && open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["time_entries"] });
    qc.invalidateQueries({ queryKey: ["followers"] });
  };

  const refreshTime = () => {
    qc.invalidateQueries({ queryKey: ["time_entries"] });
    qc.invalidateQueries({ queryKey: ["time_audit", task?.id] });
  };

  const notifyStatus = useServerFn(notifyTaskStatusChange);

  const save = useMutation({
    mutationFn: async (patch: Partial<Task>) => {
      const { error } = await db.from("tasks").update(patch).eq("id", task!.id);
      if (error) throw error;
      if (patch.status && task && patch.status !== task.status) {
        notifyStatus({
          data: {
            taskId: task.id,
            oldStatus: task.status,
            newStatus: patch.status,
            origin: window.location.origin,
          },
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Task updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const credits = useQuery({ queryKey: ["credits"], queryFn: fetchCredits });

  const timer = useMutation({
    mutationFn: async (opts?: { override?: boolean; overageMinutes?: number }) => {
      if (running) {
        await stopTimer(
          running.id,
          opts?.override && (opts.overageMinutes ?? 0) > 0
            ? { overageMinutes: opts.overageMinutes! }
            : null,
        );
      } else await startTimer(task!.id, userId);
    },
    onSuccess: (_data, opts) => {
      setOverrunOpen(false);
      refreshTime();
      if (running)
        toast.success(
          `Timer stopped — logged ${formatDuration(roundedPreview(elapsedMinutes(running.started_at)))} (15-minute increments)${
            opts?.override ? " · limit override recorded in the audit log" : ""
          }`,
        );
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const addComment = useMutation({
    mutationFn: async () => {
      const body = comment.trim();
      if (!body) throw new Error("Write something first");
      if (body.length > 4000) throw new Error("Comment is too long");
      const { error } = await db
        .from("task_comments")
        .insert({ task_id: task!.id, user_id: userId, body });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["comments", task?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFollower = useMutation({
    mutationFn: async (id: string) => {
      const isFollowing = followers.some((f) => f.task_id === task!.id && f.user_id === id);
      if (isFollowing) {
        const { error } = await db
          .from("task_followers")
          .delete()
          .eq("task_id", task!.id)
          .eq("user_id", id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from("task_followers")
          .insert({ task_id: task!.id, user_id: id });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  async function upload(file: File) {
    if (!task) return;
    setUploading(true);
    try {
      const path = `${task.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("task-files").upload(path, file);
      if (error) throw error;
      const { error: rowError } = await db.from("task_attachments").insert({
        task_id: task.id,
        user_id: userId,
        file_path: path,
        file_name: file.name,
        size_bytes: file.size,
      });
      if (rowError) throw rowError;
      qc.invalidateQueries({ queryKey: ["attachments", task.id] });
      toast.success("Document uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function download(path: string) {
    const { data, error } = await supabase.storage.from("task-files").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Could not open the file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  if (!task || !draft) return null;
  const runningRaw = running ? elapsedMinutes(running.started_at) : 0;
  void tick; // re-render every second so the live timer stays accurate
  const willLog = roundedPreview(runningRaw);
  const nextStepIn = Math.max(0, Math.ceil(willLog - runningRaw));

  const balance = task.client_id
    ? computeBalance(
        task.client_id,
        clients,
        credits.data ?? [],
        entries as (TimeEntry & { tasks: { client_id: string | null } | null })[],
      )
    : null;
  const remainingMinutes = balance ? balance.remaining * 60 : null;
  const overBy =
    running && remainingMinutes !== null && willLog > remainingMinutes
      ? willLog - remainingMinutes
      : 0;
  const wouldExceed = overBy > 0;


  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 text-left text-xl">
            {canEdit ? (
              <Input
                value={draft.title}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onBlur={() => draft.title !== task.title && save.mutate({ title: draft.title })}
                className="border-none px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
              />
            ) : (
              task.title
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 rounded-xl bg-primary-soft p-3">

          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm">
              <span className="font-semibold">{formatDuration(totalMinutes)}</span>
              <span className="text-muted-foreground"> tracked</span>
              {running && (
                <span className="ml-2 font-medium text-primary">
                  · running {formatClock(runningRaw)}
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant={running ? "destructive" : "default"}
              className="ml-auto"
              onClick={() => (wouldExceed ? setOverrunOpen(true) : timer.mutate({}))}
              disabled={timer.isPending}
            >
              {running ? <Square className="mr-1.5 size-3.5" /> : <Play className="mr-1.5 size-3.5" />}
              {running ? "Stop timer" : "Start timer"}
            </Button>
          </div>
          {running && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs">
              <span className="text-muted-foreground">Stopping now logs</span>
              <Badge className="bg-primary text-primary-foreground">
                {formatDuration(willLog)}
              </Badge>
              <span className="text-muted-foreground">
                (rounded up to 15-minute increments · next step in{" "}
                {nextStepIn === 0 ? "less than a minute" : `${nextStepIn} min`})
              </span>
            </div>
          )}
          {wouldExceed && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs">
              <AlertTriangle className="size-3.5 text-warning" />
              <span className="font-medium">
                This would exceed the client&apos;s remaining hours by {formatDuration(Math.round(overBy))}
              </span>
              <span className="text-muted-foreground">
                ({formatHours(balance?.remaining ?? 0)} left) — you can still stop and log it.
              </span>
            </div>
          )}
        </div>

        <AlertDialog open={overrunOpen} onOpenChange={setOverrunOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Log time beyond the remaining hours?</AlertDialogTitle>
              <AlertDialogDescription>
                Stopping now logs {formatDuration(willLog)}, but this client only has{" "}
                {formatHours(balance?.remaining ?? 0)} remaining — that&apos;s{" "}
                {formatDuration(Math.round(overBy))} over the balance. You can override and log it
                anyway, or keep the timer running while hours are topped up.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep running</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => timer.mutate({ override: true, overageMinutes: overBy })}
                disabled={timer.isPending}
              >
                Override and log
              </AlertDialogAction>

            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="comments">Comments ({comments.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="files">Documents ({attachments.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="time">Time ({taskEntries.filter((e) => e.minutes).length})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status">
                <Select
                  value={draft.status}
                  disabled={!canEdit}
                  onValueChange={(v) => save.mutate({ status: v as TaskStatus })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select
                  value={draft.priority}
                  disabled={!canEdit}
                  onValueChange={(v) => save.mutate({ priority: v as TaskPriority })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["low", "normal", "high", "urgent"].map((p) => (
                      <SelectItem key={p} value={p}>{p[0]!.toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Client">
                <Select
                  value={draft.client_id ?? ""}
                  disabled={!canEdit}
                  onValueChange={(v) => save.mutate({ client_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Owner">
                <Select
                  value={draft.owner_id ?? ""}
                  disabled={!canEdit}
                  onValueChange={(v) => save.mutate({ owner_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Assign someone" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Start date">
                <Input
                  type="date"
                  disabled={!canEdit}
                  value={draft.start_date ?? ""}
                  onChange={(e) => save.mutate({ start_date: e.target.value || null })}
                />
              </Field>
              <Field label="Due date">
                <Input
                  type="date"
                  disabled={!canEdit}
                  value={draft.due_date ?? ""}
                  onChange={(e) => save.mutate({ due_date: e.target.value || null })}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="recurring"
                  checked={draft.is_recurring}
                  disabled={!canEdit}
                  onCheckedChange={(v) => save.mutate({ is_recurring: v })}
                />
                <Label htmlFor="recurring">Recurring task</Label>
              </div>
              {draft.is_recurring && (
                <Select
                  value={draft.recurrence ?? "Weekly"}
                  disabled={!canEdit}
                  onValueChange={(v) => save.mutate({ recurrence: v })}
                >
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Daily", "Weekly", "Bi-weekly", "Monthly", "Quarterly"].map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Field label="Description">
              <Textarea
                rows={5}
                disabled={!canEdit}
                value={draft.description ?? ""}
                maxLength={8000}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                onBlur={() =>
                  draft.description !== task.description &&
                  save.mutate({ description: draft.description })
                }
              />
            </Field>

            <Field label="Followers">
              <div className="flex flex-wrap gap-3 rounded-xl border border-border p-3">
                {profiles.map((p) => {
                  const checked = followers.some(
                    (f) => f.task_id === task.id && f.user_id === p.id,
                  );
                  return (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={!canEdit}
                        onCheckedChange={() => toggleFollower.mutate(p.id)}
                      />
                      {p.full_name || p.email}
                    </label>
                  );
                })}
              </div>
            </Field>
          </TabsContent>

          <TabsContent value="comments" className="space-y-4 pt-4">
            <div className="space-y-3">
              {(comments.data ?? []).map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {displayName(profiles, c.user_id)}
                    </span>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{c.body}</p>
                </div>
              ))}
              {(comments.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
            </div>
            <div className="space-y-2">
              <Textarea
                rows={3}
                placeholder="Leave a comment…"
                value={comment}
                maxLength={4000}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button onClick={() => addComment.mutate()} disabled={addComment.isPending}>
                Post comment
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="files" className="space-y-3 pt-4">
            {(attachments.data ?? []).map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm"
              >
                <Paperclip className="size-4 text-muted-foreground" />
                <span className="truncate">{a.file_name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {a.size_bytes ? `${Math.round(a.size_bytes / 1024)} KB` : ""}
                </span>
                <Button size="icon" variant="ghost" onClick={() => download(a.file_path)}>
                  <Download className="size-4" />
                </Button>
              </div>
            ))}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Paperclip className="mr-2 size-4" />}
              Upload document
            </Button>
          </TabsContent>

          <TabsContent value="time" className="space-y-2 pt-4">
            {taskEntries.filter((e) => e.minutes).map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm"
              >
                <Badge variant="secondary">{formatDuration(e.minutes ?? 0)}</Badge>
                <span>{displayName(profiles, e.user_id)}</span>
                {e.limit_override && (
                  <Badge className="bg-warning-soft text-warning-foreground">
                    Override {e.override_minutes ? `+${Math.round(Number(e.override_minutes))}m` : ""}
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(e.started_at).toLocaleString()}
                </span>

                {e.user_id === userId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      await db.from("time_entries").delete().eq("id", e.id);
                      refreshTime();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            {taskEntries.filter((e) => e.minutes).length === 0 && (
              <p className="text-sm text-muted-foreground">No time logged yet.</p>
            )}

            <div className="space-y-2 pt-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <History className="size-3.5" />
                Audit trail
              </div>
              {(audit.data ?? []).map((a) => (
                <div key={a.id} className="rounded-xl border border-border/70 bg-surface-muted p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={a.action === "deleted" ? "destructive" : "outline"} className="capitalize">
                      {a.action}
                    </Badge>
                    <span>{displayName(profiles, a.actor_id ?? "")}</span>
                    {a.entry_user_id && a.entry_user_id !== a.actor_id && (
                      <span className="text-xs text-muted-foreground">
                        on behalf of {displayName(profiles, a.entry_user_id)}
                      </span>
                    )}
                    {a.limit_override && (
                      <Badge className="bg-warning-soft text-warning-foreground">
                        Limit override
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                  {a.limit_override && (
                    <p className="mt-1.5 text-xs font-medium text-warning-foreground">
                      Remaining-hours limit overridden
                      {a.override_minutes
                        ? ` — ${formatDuration(Math.round(Number(a.override_minutes)))} beyond the balance`
                        : ""}
                    </p>
                  )}

                  {a.rounded_minutes != null && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Measured {formatDuration(Math.round(a.raw_minutes ?? 0))} → logged{" "}
                      <span className="font-medium text-foreground">{formatDuration(a.rounded_minutes)}</span>
                      {a.rounding_delta_minutes != null && a.rounding_delta_minutes !== 0 && (
                        <> ({a.rounding_delta_minutes > 0 ? "+" : ""}
                        {Math.round(a.rounding_delta_minutes)} min from 15-minute rounding)</>
                      )}
                    </p>
                  )}
                  {a.rounded_minutes == null && a.action === "started" && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Timer running from {new Date(a.started_at ?? a.created_at).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              ))}
              {(audit.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No timer activity recorded yet.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
