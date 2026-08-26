import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import {
  notifyCommentDeleted,
  notifyCommentEdited,
  notifyTaskComment,
  notifyTaskEvent,
  notifyTaskStatusChange,
} from "@/lib/task-notifications.functions";
import {
  AlertTriangle,
  ArrowRightLeft,
  Download,
  History,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Play,
  Square,
  Trash2,
  UserPlus,
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
import { checkClientHourAlert } from "@/lib/hour-alerts.functions";
import {
  STATUSES,
  computeBalance,
  elapsedMinutes,
  fetchCredits,
  formatHours,
  fetchAttachments,
  fetchComments,
  fetchCommentEdits,
  fetchTimeAudit,
  formatClock,
  formatDuration,
  roundedPreview,
  startTimer,
  stopTimer,
  updateComment,
  deleteComment,
  type Client,
  type Comment,
  type CommentEdit,
  type Profile,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TimeEntry,
} from "@/lib/tracker";

const db = supabase as unknown as { from: (t: string) => any };

function profileName(p: Profile): string {
  return p.full_name || p.email || "teammate";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Renders a comment body with @mentions highlighted.
function renderCommentBody(body: string, profiles: Profile[]) {
  const names = profiles
    .map((p) => p.full_name || p.email)
    .filter((n): n is string => !!n);
  if (names.length === 0) return body;
  const pattern = new RegExp(`@(${names.map(escapeRegExp).join("|")})`, "g");
  const parts = body.split(pattern);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="rounded bg-primary-soft px-1 font-medium text-primary">
        @{part}
      </span>
    ) : (
      part
    ),
  );
}

interface Props {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  profiles: Profile[];
  clients: Client[];
  followers: { task_id: string; user_id: string }[];
  owners: { task_id: string; user_id: string }[];
  entries: TimeEntry[];
  userId: string;
  canEdit: boolean;
  initialCommentId?: string | undefined;
  onInitialCommentUsed?: () => void;
}

export function TaskDialog({
  task,
  open,
  onClose,
  profiles,
  clients,
  followers,
  owners,
  entries,
  userId,
  canEdit,
  initialCommentId,
  onInitialCommentUsed,
}: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Task | null>(task);
  const [comment, setComment] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState("details");
  const [tick, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [overrunOpen, setOverrunOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editMentionQuery, setEditMentionQuery] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const commentRefs = useRef(new Map<string, HTMLDivElement>());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(task);
    if (!open) {
      setTab("details");
      setEditingId(null);
      setHistoryId(null);
      setComment("");
    }
  }, [task, open]);
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
  const commentIds = useMemo(() => (comments.data ?? []).map((c) => c.id), [comments.data]);
  const edits = useQuery({
    queryKey: ["comment_edits", task?.id],
    queryFn: () => fetchCommentEdits(commentIds),
    enabled: !!task && open && commentIds.length > 0,
  });
  const editsByComment = useMemo(() => {
    const map = new Map<string, CommentEdit[]>();
    for (const e of edits.data ?? []) {
      const list = map.get(e.comment_id) ?? [];
      list.push(e);
      map.set(e.comment_id, list);
    }
    return map;
  }, [edits.data]);
  const attachments = useQuery({
    queryKey: ["attachments", task?.id],
    queryFn: () => fetchAttachments(task!.id),
    enabled: !!task && open,
  });

  useEffect(() => {
    if (!initialCommentId || !open || !comments.data) return;
    const el = commentRefs.current.get(initialCommentId);
    setTab("comments");
    const t1 = setTimeout(() => {
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ring-2", "ring-primary", "ring-offset-2");
      const t2 = setTimeout(() => el?.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2200);
      commentRef.current?.focus();
      return () => clearTimeout(t2);
    }, 200);
    onInitialCommentUsed?.();
    return () => clearTimeout(t1);
  }, [initialCommentId, open, comments.data, onInitialCommentUsed]);

  const audit = useQuery({
    queryKey: ["time_audit", task?.id],
    queryFn: () => fetchTimeAudit(task!.id),
    enabled: !!task && open,
  });

  const activity = useQuery({
    queryKey: ["task_activity", task?.id],
    enabled: !!task && open,
    queryFn: async () => {
      const { data, error } = await db
        .from("task_activity")
        .select("id, actor_id, kind, detail, created_at")
        .eq("task_id", task!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        actor_id: string | null;
        kind: string;
        detail: string;
        created_at: string;
      }[];
    },
  });
  const actorName = (id: string | null) => {
    if (!id) return "System";
    const p = profiles.find((pr) => pr.id === id);
    return p ? profileName(p) : id === userId ? "You" : "Someone";
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["time_entries"] });
    qc.invalidateQueries({ queryKey: ["followers"] });
    qc.invalidateQueries({ queryKey: ["owners"] });
    qc.invalidateQueries({ queryKey: ["task_activity", task?.id] });
  };

  const refreshTime = () => {
    qc.invalidateQueries({ queryKey: ["time_entries"] });
    qc.invalidateQueries({ queryKey: ["time_audit", task?.id] });
  };

  const notifyStatus = useServerFn(notifyTaskStatusChange);
  const notifyEvent = useServerFn(notifyTaskEvent);

  const save = useMutation({
    mutationFn: async (patch: Partial<Task>) => {
      const { error } = await db.from("tasks").update(patch).eq("id", task!.id);
      if (error) throw error;
      if (!task) return;
      const origin = window.location.origin;
      if (patch.status && patch.status !== task.status) {
        notifyStatus({
          data: {
            taskId: task.id,
            oldStatus: task.status,
            newStatus: patch.status,
            origin,
          },
        }).catch(() => {});
      }
      if (patch.owner_id !== undefined && patch.owner_id !== task.owner_id && patch.owner_id) {
        notifyEvent({
          data: { taskId: task.id, kind: "assigned", targetUserId: patch.owner_id, origin },
        }).catch(() => {});
      }
      const changed: string[] = [];
      if (patch.title !== undefined && patch.title !== task.title) changed.push("the title");
      if (patch.due_date !== undefined && patch.due_date !== task.due_date)
        changed.push(patch.due_date ? `the due date to ${patch.due_date}` : "removed the due date");
      if (patch.start_date !== undefined && patch.start_date !== task.start_date)
        changed.push(
          patch.start_date ? `the start date to ${patch.start_date}` : "removed the start date",
        );
      if (patch.priority !== undefined && patch.priority !== task.priority)
        changed.push(`the priority to ${patch.priority}`);
      if (changed.length > 0) {
        notifyEvent({
          data: { taskId: task.id, kind: "details", detail: changed.join(" and "), origin },
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
        if (task?.client_id) {
          // Fire-and-forget: warns the client by email once 80% is used.
          checkClientHourAlert({
            data: { clientId: task.client_id, origin: window.location.origin },
          }).catch(() => undefined);
        }
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


  const notifyComment = useServerFn(notifyTaskComment);

  // @mention autocomplete in the comment composer.
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return profiles
      .filter((p) => p.id !== userId)
      .filter((p) => profileName(p).toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, profiles, userId]);

  function onEditChange(value: string, caret: number) {
    setEditBody(value);
    const m = value.slice(0, caret).match(/@([^\n@]{0,40})$/);
    setEditMentionQuery(m ? (m[1] ?? "") : null);
  }

  function insertEditMention(p: Profile) {
    const caret = editRef.current?.selectionStart ?? editBody.length;
    const name = profileName(p);
    const before = editBody.slice(0, caret).replace(/@[^\n@]{0,40}$/, `@${name} `);
    setEditBody(before + editBody.slice(caret));
    setEditMentionQuery(null);
    editRef.current?.focus();
  }

  const editMentionCandidates = useMemo(() => {
    if (editMentionQuery === null) return [];
    const q = editMentionQuery.toLowerCase();
    return profiles
      .filter((p) => p.id !== userId)
      .filter((p) => profileName(p).toLowerCase().includes(q))
      .slice(0, 6);
  }, [editMentionQuery, profiles, userId]);

  function onCommentChange(value: string, caret: number) {
    setComment(value);
    const m = value.slice(0, caret).match(/@([^\n@]{0,40})$/);
    setMentionQuery(m ? (m[1] ?? "") : null);
  }

  function insertMention(p: Profile) {
    const caret = commentRef.current?.selectionStart ?? comment.length;
    const name = profileName(p);
    const before = comment.slice(0, caret).replace(/@[^\n@]{0,40}$/, `@${name} `);
    setComment(before + comment.slice(caret));
    setMentionQuery(null);
    commentRef.current?.focus();
  }

  const addComment = useMutation({
    mutationFn: async ({ body: rawBody, parentId }: { body: string; parentId: string | null }) => {
      const body = rawBody.trim();
      if (!body) throw new Error("Write something first");
      if (body.length > 4000) throw new Error("Comment is too long");
      const { data, error } = await db
        .from("task_comments")
        .insert({ task_id: task!.id, user_id: userId, body, parent_id: parentId })
        .select("id")
        .single();
      if (error) throw error;
      const mentionIds = extractMentionIds(body);
      // Fire-and-forget: email + in-app notification for owner/followers/commenters/mentions.
      notifyComment({
        data: {
          taskId: task!.id,
          commentId: (data as { id: string }).id,
          commentBody: body,
          origin: window.location.origin,
          mentionIds,
        },
      }).catch(() => {});
    },
    onSuccess: (_v, vars) => {
      if (vars.parentId) {
        setReplyingTo(null);
        setReplyBody("");
        setReplyMentionQuery(null);
      } else {
        setComment("");
        setMentionQuery(null);
      }
      qc.invalidateQueries({ queryKey: ["comments", task?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onReplyChange(value: string, caret: number) {
    setReplyBody(value);
    const m = value.slice(0, caret).match(/@([^\n@]{0,40})$/);
    setReplyMentionQuery(m ? (m[1] ?? "") : null);
  }

  function insertReplyMention(p: Profile) {
    const caret = replyRef.current?.selectionStart ?? replyBody.length;
    const name = profileName(p);
    const before = replyBody.slice(0, caret).replace(/@[^\n@]{0,40}$/, `@${name} `);
    setReplyBody(before + replyBody.slice(caret));
    setReplyMentionQuery(null);
    replyRef.current?.focus();
  }

  const replyMentionCandidates = useMemo(() => {
    if (replyMentionQuery === null) return [];
    const q = replyMentionQuery.toLowerCase();
    return profiles
      .filter((p) => p.id !== userId)
      .filter((p) => profileName(p).toLowerCase().includes(q))
      .slice(0, 6);
  }, [replyMentionQuery, profiles, userId]);

  // Group replies under their top-level parent comment.
  const commentThreads = useMemo(() => {
    const all = comments.data ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    const roots: Comment[] = [];
    const children = new Map<string, Comment[]>();
    for (const c of all) {
      const root = c.parent_id && byId.has(c.parent_id)
        ? (byId.get(c.parent_id)!.parent_id && byId.has(byId.get(c.parent_id)!.parent_id!)
            ? byId.get(byId.get(c.parent_id)!.parent_id!)!.id
            : c.parent_id)
        : null;
      if (root && byId.has(root)) {
        const list = children.get(root) ?? [];
        list.push(c);
        children.set(root, list);
      } else {
        roots.push(c);
      }
    }
    return { roots, children, byId };
  }, [comments.data]);

  // Exact @mention detection shared by post + edit paths — "@Maria Elena"
  // must not also match "Maria".
  function extractMentionIds(body: string): string[] {
    return profiles
      .filter((p) => p.id !== userId)
      .filter((p) => {
        const name = profileName(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`@${name}(?=$|[^\\p{L}\\p{N}_])`, "u").test(body);
      })
      .map((p) => p.id);
  }

  const notifyCommentEditedFn = useServerFn(notifyCommentEdited);
  const notifyCommentDeletedFn = useServerFn(notifyCommentDeleted);

  const saveEdit = useMutation({
    mutationFn: async (commentId: string) => {
      await updateComment(commentId, editBody);
      // Fire-and-forget: sync mention notifications with the edited text.
      notifyCommentEditedFn({
        data: {
          taskId: task!.id,
          commentId,
          commentBody: editBody.trim(),
          origin: window.location.origin,
          mentionIds: extractMentionIds(editBody.trim()),
        },
      }).catch(() => {});
    },
    onSuccess: () => {
      setEditingId(null);
      setEditBody("");
      setEditMentionQuery(null);
      qc.invalidateQueries({ queryKey: ["comments", task?.id] });
      qc.invalidateQueries({ queryKey: ["comment_edits", task?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const removeComment = useMutation({
    mutationFn: async (commentId: string) => {
      await deleteComment(commentId);
      // Fire-and-forget: remove notifications that point at the deleted comment.
      notifyCommentDeletedFn({
        data: { taskId: task!.id, commentId },
      }).catch(() => {});
    },
    onSuccess: () => {
      setDeleteTarget(null);
      toast.success("Comment deleted");
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
        notifyEvent({
          data: {
            taskId: task!.id,
            kind: "follower_added",
            targetUserId: id,
            origin: window.location.origin,
          },
        }).catch(() => {});
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleOwner = useMutation({
    mutationFn: async (id: string) => {
      const isOwner = owners.some((o) => o.task_id === task!.id && o.user_id === id);
      if (isOwner) {
        const { error } = await db
          .from("task_owners")
          .delete()
          .eq("task_id", task!.id)
          .eq("user_id", id);
        if (error) throw error;
        // Keep the legacy primary owner in sync: if the removed person was the
        // primary owner, promote another remaining owner (or clear it).
        if (task!.owner_id === id) {
          const next = owners.find((o) => o.task_id === task!.id && o.user_id !== id);
          const { error: syncError } = await db
            .from("tasks")
            .update({ owner_id: next?.user_id ?? null })
            .eq("id", task!.id);
          if (syncError) throw syncError;
        }
      } else {
        const { error } = await db
          .from("task_owners")
          .insert({ task_id: task!.id, user_id: id });
        if (error) throw error;
        if (!task!.owner_id) {
          const { error: syncError } = await db
            .from("tasks")
            .update({ owner_id: id })
            .eq("id", task!.id);
          if (syncError) throw syncError;
        }
        notifyEvent({
          data: {
            taskId: task!.id,
            kind: "assigned",
            targetUserId: id,
            origin: window.location.origin,
          },
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owners"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function upload(file: File) {
    if (!task) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error(`"${file.name}" is over the 20 MB limit`);
      return;
    }
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

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the comment. Any unread notifications pointing to it will
                be removed too — mention emails already delivered can&apos;t be unsent.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && removeComment.mutate(deleteTarget)}
                disabled={removeComment.isPending}
              >
                {removeComment.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Delete comment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="comments">Comments ({comments.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="files">Documents ({attachments.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="time">Time ({taskEntries.filter((e) => e.minutes).length})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
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

            <Field label="Owners">
              <div className="flex flex-wrap gap-3 rounded-xl border border-border p-3">
                {profiles.map((p) => {
                  const checked =
                    owners.some((o) => o.task_id === task.id && o.user_id === p.id) ||
                    task.owner_id === p.id;
                  return (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={!canEdit}
                        onCheckedChange={() => toggleOwner.mutate(p.id)}
                      />
                      {p.full_name || p.email}
                    </label>
                  );
                })}
              </div>
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
              {commentThreads.roots.map((c) => {
                const history = editsByComment.get(c.id) ?? [];
                const isOwn = c.user_id === userId;
                const isEditing = editingId === c.id;
                const replies = commentThreads.children.get(c.id) ?? [];
                return (
                  <div
                    key={c.id}
                    ref={(el) => {
                      if (el) commentRefs.current.set(c.id, el);
                    }}
                    className="rounded-xl border border-border p-3 transition-all"
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{displayName(profiles, c.user_id)}</span>
                      <div className="flex items-center gap-2">
                        {c.edited_at && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            edited
                          </span>
                        )}
                        <span>{new Date(c.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="relative mt-2">
                        <Textarea
                          ref={editRef}
                          rows={3}
                          value={editBody}
                          maxLength={4000}
                          onChange={(e) =>
                            onEditChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditMentionQuery(null);
                            }
                          }}
                          onBlur={() => setTimeout(() => setEditMentionQuery(null), 150)}
                        />
                        {editMentionCandidates.length > 0 && (
                          <div className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                            {editMentionCandidates.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  insertEditMention(p);
                                }}
                              >
                                <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                                  {profileName(p).slice(0, 1).toUpperCase()}
                                </span>
                                <span className="truncate">{profileName(p)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            disabled={saveEdit.isPending || !editBody.trim() || editBody.trim() === c.body}
                            onClick={() => saveEdit.mutate(c.id)}
                          >
                            {saveEdit.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(null);
                              setEditBody("");
                              setEditMentionQuery(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm">{renderCommentBody(c.body, profiles)}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => {
                              if (replyingTo === c.id) {
                                setReplyingTo(null);
                                setReplyBody("");
                                setReplyMentionQuery(null);
                              } else {
                                setReplyingTo(c.id);
                                setReplyBody("");
                                setReplyMentionQuery(null);
                                setTimeout(() => replyRef.current?.focus(), 50);
                              }
                            }}
                          >
                            <MessageSquare className="size-3.5" />
                            Reply{replies.length > 0 ? ` (${replies.length})` : ""}
                          </Button>
                          {(isOwn || canEdit) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => {
                                setEditingId(c.id);
                                setEditBody(c.body);
                                setEditMentionQuery(null);
                                setTimeout(() => editRef.current?.focus(), 50);
                              }}
                            >
                              <Pencil className="size-3.5" />
                              Edit
                            </Button>
                          )}
                          {(isOwn || canEdit) && replies.length === 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(c.id)}
                            >
                              <Trash2 className="size-3.5" />
                              Delete
                            </Button>
                          )}
                          {history.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => setHistoryId(historyId === c.id ? null : c.id)}
                            >
                              <History className="size-3.5" />
                              {history.length} edit{history.length > 1 ? "s" : ""}
                            </Button>
                          )}
                        </div>
                        {historyId === c.id && (
                          <div className="mt-3 space-y-2 rounded-xl border border-border/70 bg-surface-muted p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Edit history
                            </div>
                            {history.map((h, i) => (
                              <div key={h.id} className="text-xs">
                                <span className="font-medium text-muted-foreground">{i + 1}.</span>{" "}
                                <span className="whitespace-pre-wrap">{h.old_body}</span>
                                <span className="ml-2 text-muted-foreground">
                                  — {displayName(profiles, h.edited_by ?? "")} on{" "}
                                  {new Date(h.created_at).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {replies.length > 0 && (
                      <div className="mt-3 space-y-2 border-l-2 border-primary-soft pl-3">
                        {replies.map((r) => {
                          const rHistory = editsByComment.get(r.id) ?? [];
                          const rIsOwn = r.user_id === userId;
                          const rIsEditing = editingId === r.id;
                          const rParent = r.parent_id ? commentThreads.byId.get(r.parent_id) : undefined;
                          return (
                            <div
                              key={r.id}
                              ref={(el) => {
                                if (el) commentRefs.current.set(r.id, el);
                              }}
                              className="rounded-xl border border-border/70 bg-surface-muted p-2.5"
                            >
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">
                                  {displayName(profiles, r.user_id)}
                                  {rParent && rParent.user_id !== r.user_id && (
                                    <span className="ml-1 font-normal text-muted-foreground">
                                      replying to {displayName(profiles, rParent.user_id)}
                                    </span>
                                  )}
                                </span>
                                <div className="flex items-center gap-2">
                                  {r.edited_at && (
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                      edited
                                    </span>
                                  )}
                                  <span>{new Date(r.created_at).toLocaleString()}</span>
                                </div>
                              </div>
                              {rIsEditing ? (
                                <div className="relative mt-2">
                                  <Textarea
                                    ref={editRef}
                                    rows={2}
                                    value={editBody}
                                    maxLength={4000}
                                    onChange={(e) =>
                                      onEditChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        setEditingId(null);
                                        setEditMentionQuery(null);
                                      }
                                    }}
                                    onBlur={() => setTimeout(() => setEditMentionQuery(null), 150)}
                                  />
                                  {editMentionCandidates.length > 0 && (
                                    <div className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                                      {editMentionCandidates.map((p) => (
                                        <button
                                          key={p.id}
                                          type="button"
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            insertEditMention(p);
                                          }}
                                        >
                                          <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                                            {profileName(p).slice(0, 1).toUpperCase()}
                                          </span>
                                          <span className="truncate">{profileName(p)}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  <div className="mt-2 flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      disabled={saveEdit.isPending || !editBody.trim() || editBody.trim() === r.body}
                                      onClick={() => saveEdit.mutate(r.id)}
                                    >
                                      {saveEdit.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setEditingId(null);
                                        setEditBody("");
                                        setEditMentionQuery(null);
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="mt-1 whitespace-pre-wrap text-sm">{renderCommentBody(r.body, profiles)}</p>
                                  <div className="mt-1.5 flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 gap-1 px-2 text-xs"
                                      onClick={() => {
                                        setReplyingTo(c.id);
                                        setReplyBody(`@${displayName(profiles, r.user_id)} `);
                                        setReplyMentionQuery(null);
                                        setTimeout(() => replyRef.current?.focus(), 50);
                                      }}
                                    >
                                      <MessageSquare className="size-3" />
                                      Reply
                                    </Button>
                                    {(rIsOwn || canEdit) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 gap-1 px-2 text-xs"
                                        onClick={() => {
                                          setEditingId(r.id);
                                          setEditBody(r.body);
                                          setEditMentionQuery(null);
                                          setTimeout(() => editRef.current?.focus(), 50);
                                        }}
                                      >
                                        <Pencil className="size-3" />
                                        Edit
                                      </Button>
                                    )}
                                    {(rIsOwn || canEdit) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                                        onClick={() => setDeleteTarget(r.id)}
                                      >
                                        <Trash2 className="size-3" />
                                        Delete
                                      </Button>
                                    )}
                                    {rHistory.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 gap-1 px-2 text-xs"
                                        onClick={() => setHistoryId(historyId === r.id ? null : r.id)}
                                      >
                                        <History className="size-3" />
                                        {rHistory.length}
                                      </Button>
                                    )}
                                  </div>
                                  {historyId === r.id && (
                                    <div className="mt-2 space-y-2 rounded-xl border border-border/70 bg-background p-2.5">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Edit history
                                      </div>
                                      {rHistory.map((h, i) => (
                                        <div key={h.id} className="text-xs">
                                          <span className="font-medium text-muted-foreground">{i + 1}.</span>{" "}
                                          <span className="whitespace-pre-wrap">{h.old_body}</span>
                                          <span className="ml-2 text-muted-foreground">
                                            — {displayName(profiles, h.edited_by ?? "")} on{" "}
                                            {new Date(h.created_at).toLocaleString()}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {replyingTo === c.id && (
                      <div className="relative mt-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-3">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">
                          Replying to {displayName(profiles, c.user_id)}
                        </div>
                        <Textarea
                          ref={replyRef}
                          rows={2}
                          placeholder="Write a reply… use @ to mention a teammate"
                          value={replyBody}
                          maxLength={4000}
                          onChange={(e) =>
                            onReplyChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setReplyingTo(null);
                              setReplyBody("");
                              setReplyMentionQuery(null);
                            }
                          }}
                          onBlur={() => setTimeout(() => setReplyMentionQuery(null), 150)}
                        />
                        {replyMentionCandidates.length > 0 && (
                          <div className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                            {replyMentionCandidates.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  insertReplyMention(p);
                                }}
                              >
                                <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                                  {profileName(p).slice(0, 1).toUpperCase()}
                                </span>
                                <span className="truncate">{profileName(p)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            disabled={addComment.isPending || !replyBody.trim()}
                            onClick={() => addComment.mutate({ body: replyBody, parentId: c.id })}
                          >
                            {addComment.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                            Reply
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyBody("");
                              setReplyMentionQuery(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {(comments.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Textarea
                  ref={commentRef}
                  rows={3}
                  placeholder="Leave a comment… use @ to mention a teammate"
                  value={comment}
                  maxLength={4000}
                  onChange={(e) =>
                    onCommentChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setMentionQuery(null);
                  }}
                  onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
                />
                {mentionCandidates.length > 0 && (
                  <div className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                    {mentionCandidates.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertMention(p);
                        }}
                      >
                        <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                          {profileName(p).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate">{profileName(p)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={() => addComment.mutate({ body: comment, parentId: null })} disabled={addComment.isPending}>
                Post comment
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="files" className="pt-4">
            <div
              className={`space-y-3 rounded-2xl border-2 border-dashed p-4 transition-colors ${
                dragging
                  ? "border-primary bg-primary-soft/50"
                  : "border-border/70 bg-transparent"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (!dragging) setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const files = Array.from(e.dataTransfer.files);
                for (const f of files) void upload(f);
              }}
            >
              {(attachments.data ?? []).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-sm"
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
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {dragging
                    ? "Drop your files here"
                    : "Drag & drop files here, or pick them from your device"}
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    for (const f of Array.from(e.target.files ?? [])) void upload(f);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Paperclip className="mr-2 size-4" />
                  )}
                  Upload document
                </Button>
                <p className="text-xs text-muted-foreground">Up to 20 MB per file</p>
              </div>
            </div>
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

          <TabsContent value="activity" className="pt-4">
            <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {(activity.data ?? []).map((a) => (
                <div key={a.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                  <span className="mt-0.5 rounded-full bg-primary-soft p-1.5 text-accent-foreground">
                    {a.kind === "comment" ? (
                      <MessageSquare className="size-3.5" />
                    ) : a.kind === "status" ? (
                      <ArrowRightLeft className="size-3.5" />
                    ) : a.kind === "assignment" || a.kind === "follower" ? (
                      <UserPlus className="size-3.5" />
                    ) : a.kind === "file" ? (
                      <Paperclip className="size-3.5" />
                    ) : (
                      <Pencil className="size-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{actorName(a.actor_id)}</span>{" "}
                      <span className="text-muted-foreground">{a.detail}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {activity.isLoading && (
                <p className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading activity…
                </p>
              )}
              {!activity.isLoading && (activity.data ?? []).length === 0 && (
                <p className="px-2 py-6 text-sm text-muted-foreground">
                  No activity recorded yet — changes will appear here as they happen.
                </p>
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
