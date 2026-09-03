import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  Loader2,
  Paperclip,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  generateTaskBrief,
  notifyAdminsTaskRequest,
  type TaskBrief,
} from "@/lib/request-task.functions";
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
import {
  earliestBusinessDate,
  friendlyDate,
  meetsMinimumBusinessDays,
  toISODate,
} from "@/lib/business-days";
import { fetchProvenTasks, type Client, type ClientBalance, type ProvenTask } from "@/lib/tracker";

const db = supabase as unknown as { from: (t: string) => any };

const MAX_FILE_BYTES = 20 * 1024 * 1024;

interface DraftFile {
  path: string;
  name: string;
  mime: string;
  size: number;
}

type Path = "pick" | "proven" | "describe";

const URGENCIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function RequestTaskDialog({
  client,
  userId,
  balance,
}: {
  client: Client;
  userId: string;
  balance: ClientBalance | null;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<Path>("pick");
  const [step, setStep] = useState<"path" | "details" | "review" | "done">("path");

  // Proven task picker
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerCategory, setPickerCategory] = useState("all");
  const [proven, setProven] = useState<ProvenTask | null>(null);

  // Intake fields
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [subAccount, setSubAccount] = useState("");
  const [project, setProject] = useState(client.default_project ?? "");
  const [urgency, setUrgency] = useState("normal");
  const [desiredDate, setDesiredDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState("Weekly");
  const [links, setLinks] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Generated / reviewed brief
  const [brief, setBrief] = useState<TaskBrief | null>(null);
  const [submittedTaskId, setSubmittedTaskId] = useState<string | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestTitle, setSuggestTitle] = useState("");
  const [suggestCategory, setSuggestCategory] = useState("");

  const library = useQuery({ queryKey: ["proven_tasks"], queryFn: fetchProvenTasks, enabled: open });

  const generate = useServerFn(generateTaskBrief);
  const notifyAdmins = useServerFn(notifyAdminsTaskRequest);

  const minDate = toISODate(earliestBusinessDate(3));
  const lowHours =
    balance && balance.bought > 0 && balance.remaining <= balance.bought * 0.2;

  const categories = useMemo(
    () => [...new Set((library.data ?? []).map((t) => t.category))].sort(),
    [library.data],
  );

  const pickerList = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return (library.data ?? [])
      .filter((t) => t.status === "active")
      .filter((t) => pickerCategory === "all" || t.category === pickerCategory)
      .filter(
        (t) =>
          !q ||
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q),
      );
  }, [library.data, pickerSearch, pickerCategory]);

  function resetAll() {
    setPath("pick");
    setStep("path");
    setPickerSearch("");
    setPickerCategory("all");
    setProven(null);
    setTitle("");
    setDetails("");
    setSubAccount("");
    setProject(client.default_project ?? "");
    setUrgency("normal");
    setDesiredDate("");
    setDateError(null);
    setRecurring(false);
    setRecurrence("Weekly");
    setLinks("");
    setFiles([]);
    setBrief(null);
    setSubmittedTaskId(null);
  }

  const subAccounts = useQuery({
    queryKey: ["ghl-sub-accounts"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from("ghl_sub_accounts").select("name").order("name");
      if (error) return [] as { name: string }[];
      return (data ?? []) as { name: string }[];
    },
  });

  const suggestProven = useMutation({
    mutationFn: async () => {
      const suggestion = suggestTitle.trim();
      if (!suggestion) throw new Error("Name the task you'd like us to add");
      const { error } = await db.from("proven_tasks").insert({
        title: suggestion,
        category: suggestCategory.trim() || "General",
        status: "draft",
        is_system: false,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thanks — the team will review your suggested task");
      setSuggestTitle("");
      setSuggestCategory("");
      setShowSuggest(false);
      void qc.invalidateQueries({ queryKey: ["proven_tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function pickProven(t: ProvenTask) {
    setProven(t);
    setTitle(t.title);
    setDetails(t.description ?? "");
    setBrief({
      title: t.title,
      description: t.description ?? "",
      subtasks: t.subtasks ?? [],
      deliverables: t.deliverables ?? [],
      qc_checklist: t.qc_checklist ?? [],
      estimated_hours: t.estimated_hours,
      suggested_category: t.category,
      matched_proven_task_id: t.id,
    });
    setPath("proven");
    setStep("details");
  }

  async function uploadDraft(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`${file.name} is over the 20MB limit`);
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `request-drafts/${userId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from("task-files").upload(path, file);
      if (error) throw error;
      setFiles((prev) => [
        ...prev,
        { path, name: file.name, mime: file.type || "application/octet-stream", size: file.size },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onDesiredDate(v: string) {
    setDesiredDate(v);
    if (v && !meetsMinimumBusinessDays(v, 3)) {
      setDateError(
        `We need at least 3 business days (Mon–Fri). The earliest available date is ${friendlyDate(minDate)}.`,
      );
    } else {
      setDateError(null);
    }
  }

  const generateBrief = useMutation({
    mutationFn: async () => {
      if (details.trim().length < 10) {
        throw new Error("Describe what you need in at least a sentence");
      }
      if (desiredDate && !meetsMinimumBusinessDays(desiredDate, 3)) {
        throw new Error(`Earliest available date is ${friendlyDate(minDate)}`);
      }
      const result = await generate({
        data: {
          description: details,
          subAccount: subAccount.trim() || undefined,
          urgency,
          desiredDate: desiredDate || undefined,
          files: files.map((f) => ({ path: f.path, name: f.name, mime: f.mime })),
        },
      });
      return result;
    },
    onSuccess: (result) => {
      setBrief(result);
      if (!title.trim()) setTitle(result.title);
      setStep("review");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!brief) throw new Error("Nothing to submit yet");
      const cleanTitle = (title.trim() || brief.title).trim();
      if (!cleanTitle) throw new Error("Give the request a title");
      if (desiredDate && !meetsMinimumBusinessDays(desiredDate, 3)) {
        throw new Error(`Earliest available date is ${friendlyDate(minDate)}`);
      }
      const linkLines = links
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const description = [
        brief.description,
        linkLines.length > 0 ? `\nReference links:\n${linkLines.join("\n")}` : "",
        files.length > 0
          ? `\nAttached files: ${files.map((f) => f.name).join(", ")}`
          : "",
      ]
        .join("")
        .trim();

      const { data: created, error } = await db
        .from("tasks")
        .insert({
          title: cleanTitle,
          description,
          project: project.trim() || null,
          client_id: client.id,
          status: "requested",
          priority: urgency,
          due_date: desiredDate || null,
          requested_completion_date: desiredDate || null,
          is_recurring: recurring,
          recurrence: recurring ? recurrence : null,
          source: "client_request",
          sub_account: subAccount.trim() || null,
          proven_task_id: brief.matched_proven_task_id ?? proven?.id ?? null,
          subtasks: brief.subtasks,
          deliverables: brief.deliverables,
          qc_checklist: brief.qc_checklist,
          estimated_hours: brief.estimated_hours,
          created_by: userId,
          position: Date.now(),
        })
        .select("id")
        .single();
      if (error) throw error;

      if (files.length > 0) {
        const { error: attError } = await db.from("task_attachments").insert(
          files.map((f) => ({
            task_id: created.id,
            user_id: userId,
            file_path: f.path,
            file_name: f.name,
            size_bytes: f.size,
          })),
        );
        if (attError) throw attError;
      }

      notifyAdmins({
        data: { taskId: created.id, origin: window.location.origin },
      }).catch(() => {});
      return created.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setSubmittedTaskId(id);
      setStep("done");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detailsValid =
    path === "proven"
      ? title.trim().length > 0
      : details.trim().length >= 10;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetAll();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Send className="mr-1.5 size-4" /> Request a task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "path" && "What do you need?"}
            {step === "details" && (path === "proven" ? "Request details" : "Describe it yourself")}
            {step === "review" && "Review your request"}
            {step === "done" && "Request submitted"}
          </DialogTitle>
        </DialogHeader>

        {lowHours && step !== "done" && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              Your balance is at <span className="font-semibold">{balance!.remaining.toFixed(2)}h</span>{" "}
              remaining (20% or less of your purchased hours). New work may need a top-up.
            </p>
          </div>
        )}

        {step === "path" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-56 flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Describe what you need…"
                  className="h-12 rounded-xl pl-9 text-base"
                />
              </div>
              <Button
                variant="outline"
                className="h-12 rounded-xl"
                onClick={() => {
                  setPath("describe");
                  if (pickerSearch.trim()) setDetails(pickerSearch.trim());
                  setStep("details");
                }}
              >
                <Sparkles className="mr-1.5 size-4" /> Blank task
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPickerCategory(c)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                    pickerCategory === c
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-surface-muted"
                  }`}
                >
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>

            <div className="grid max-h-[52vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {pickerList.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickProven(t)}
                  className="rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-surface-muted"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.category}
                  </p>
                  <p className="mt-1.5 font-semibold leading-snug">{t.title}</p>
                  {t.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {t.estimated_hours != null && (
                      <span className="flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
                        <Clock className="size-3" /> ~{t.estimated_hours}h
                      </span>
                    )}
                    {(t.subtasks?.length ?? 0) > 0 && (
                      <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t.subtasks.length} subtasks
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {pickerList.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground sm:col-span-2">
                  {library.isLoading
                    ? "Loading library…"
                    : "No proven task matches — use “Blank task” and AI will draft the brief."}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-dashed border-border p-3">
              {!showSuggest ? (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => setShowSuggest(true)}
                >
                  Can't find it? Suggest a proven task for the library
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Suggest a proven task</p>
                  <Input
                    value={suggestTitle}
                    maxLength={200}
                    placeholder="Task name, e.g. 'Build a webinar registration funnel'"
                    onChange={(e) => setSuggestTitle(e.target.value)}
                  />
                  <Input
                    value={suggestCategory}
                    maxLength={80}
                    placeholder="Category (optional), e.g. Funnels & websites"
                    onChange={(e) => setSuggestCategory(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={suggestProven.isPending}
                      onClick={() => suggestProven.mutate()}
                    >
                      Send suggestion
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowSuggest(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}


        {step === "details" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-title">What do you need?</Label>
              <Input
                id="r-title"
                value={title}
                maxLength={200}
                placeholder="e.g. Set up a lead nurture workflow"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-details">
                Details — what does done look like?{path === "describe" && " *"}
              </Label>
              <Textarea
                id="r-details"
                rows={5}
                value={details}
                maxLength={12000}
                placeholder="Describe the outcome you want, anything the team should know, and what success looks like."
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="r-sub">GHL sub-account name</Label>
                <Input
                  id="r-sub"
                  value={subAccount}
                  maxLength={160}
                  list="ghl-sub-accounts"
                  placeholder="Which sub-account is this for?"
                  onChange={(e) => setSubAccount(e.target.value)}
                />
                {(subAccounts.data?.length ?? 0) > 0 && (
                  <datalist id="ghl-sub-accounts">
                    {subAccounts.data!.map((s) => (
                      <option key={s.name} value={s.name} />
                    ))}
                  </datalist>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-project">Project (optional)</Label>
                <Input
                  id="r-project"
                  value={project}
                  maxLength={120}
                  onChange={(e) => setProject(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Urgency</Label>
                <Select value={urgency} onValueChange={setUrgency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {URGENCIES.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-date">Desired completion</Label>
                <Input
                  id="r-date"
                  type="date"
                  min={minDate}
                  value={desiredDate}
                  onChange={(e) => onDesiredDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Earliest available: {friendlyDate(minDate)} (3 business days, Mon–Fri).
                </p>
                {dateError && <p className="text-xs font-medium text-destructive">{dateError}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Repeats?</Label>
                <div className="flex h-9 items-center gap-3">
                  <Switch checked={recurring} onCheckedChange={setRecurring} />
                  {recurring && (
                    <Select value={recurrence} onValueChange={setRecurrence}>
                      <SelectTrigger className="h-9 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Weekly", "Monthly"].map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-links">Reference links — optional</Label>
                <Textarea
                  id="r-links"
                  rows={2}
                  value={links}
                  placeholder="One link per line"
                  onChange={(e) => setLinks(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Attachments — any format, up to 20MB each</Label>
              <div
                className="rounded-xl border border-dashed border-border bg-surface-muted/40 p-4 text-sm"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  for (const f of Array.from(e.dataTransfer.files)) void uploadDraft(f);
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    for (const f of Array.from(e.target.files ?? [])) void uploadDraft(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="flex items-center gap-2 text-primary hover:underline disabled:opacity-60"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Paperclip className="size-4" />
                  )}
                  Drop files here or click to upload
                </button>
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {files.map((f) => (
                      <li key={f.path} className="flex items-center gap-2 text-xs">
                        <FileText className="size-3.5 text-muted-foreground" />
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => setFiles((prev) => prev.filter((x) => x.path !== f.path))}
                        >
                          <X className="size-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {path === "describe" && (
                <p className="text-xs text-muted-foreground">
                  AI reads text, spreadsheet, PDF and image files and works their contents into the
                  brief and subtasks.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep("path");
                  if (path === "describe") setPath("pick");
                }}
              >
                <ArrowLeft className="mr-1.5 size-4" /> Back
              </Button>
              {path === "describe" ? (
                <Button
                  onClick={() => generateBrief.mutate()}
                  disabled={!detailsValid || generateBrief.isPending || !!dateError}
                >
                  {generateBrief.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" /> Building your brief…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1.5 size-4" /> Generate the brief
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => setStep("review")}
                  disabled={!detailsValid || !!dateError}
                >
                  Review request
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "review" && brief && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rv-title">Title</Label>
              <Input
                id="rv-title"
                value={title || brief.title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rv-desc">Detailed description for the team</Label>
              <Textarea
                id="rv-desc"
                rows={7}
                value={brief.description}
                maxLength={12000}
                onChange={(e) => setBrief({ ...brief, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <ListChecks className="size-4 text-primary" /> Subtasks ({brief.subtasks.length})
                </Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setEditingList(editingList === "subtasks" ? null : "subtasks")}
                >
                  {editingList === "subtasks" ? "Done editing" : "Edit subtasks"}
                </button>
              </div>
              {editingList === "subtasks" ? (
                <Textarea
                  rows={Math.min(12, Math.max(4, brief.subtasks.length + 1))}
                  value={brief.subtasks.join("\n")}
                  onChange={(e) =>
                    setBrief({
                      ...brief,
                      subtasks: e.target.value
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean),
                    })
                  }
                />
              ) : (
                <ul className="space-y-1.5">
                  {brief.subtasks.map((s, i) => (
                    <li
                      key={`${s}-${i}`}
                      className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <Checkbox checked disabled className="mt-0.5" aria-hidden />
                      <span className="text-sm leading-relaxed">{s}</span>
                    </li>
                  ))}
                  {brief.subtasks.length === 0 && (
                    <li className="text-sm text-muted-foreground">No subtasks yet.</li>
                  )}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Each subtask becomes its own checkbox inside the task for the team to tick off.
              </p>
            </div>

            {(
              [
                ["Deliverables", "deliverables"],
                ["QC checklist", "qc_checklist"],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label} — one per line</Label>
                <Textarea
                  rows={Math.min(8, Math.max(3, brief[key].length + 1))}
                  value={brief[key].join("\n")}
                  onChange={(e) =>
                    setBrief({
                      ...brief,
                      [key]: e.target.value
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            ))}

            <div className="grid gap-2 rounded-xl border border-border bg-surface-muted/50 p-3 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Sub-account: </span>
                {subAccount.trim() || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Urgency: </span>
                {URGENCIES.find((u) => u.value === urgency)?.label}
              </p>
              <p>
                <span className="text-muted-foreground">Desired completion: </span>
                {desiredDate ? friendlyDate(desiredDate) : "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Estimated effort: </span>
                {brief.estimated_hours != null ? `~${brief.estimated_hours}h` : "—"}
              </p>
              <p className="sm:col-span-2">
                <span className="text-muted-foreground">Files: </span>
                {files.length > 0 ? files.map((f) => f.name).join(", ") : "None"}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep("details")}>
                <ArrowLeft className="mr-1.5 size-4" /> Edit details
              </Button>
              <div className="flex gap-2">
                {path === "describe" && (
                  <Button
                    variant="secondary"
                    onClick={() => generateBrief.mutate()}
                    disabled={generateBrief.isPending}
                  >
                    {generateBrief.isPending ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 size-4" />
                    )}
                    Regenerate
                  </Button>
                )}
                <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
                  {submit.isPending ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 size-4" />
                  )}
                  This is correct — submit request
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="mx-auto size-12 text-status-completed" />
            <p className="text-lg font-semibold">Your request is in the Requested column</p>
            <p className="text-sm text-muted-foreground">
              The team has been emailed a link to your request and will pick it up from there.
            </p>
            <div className="flex justify-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  if (submittedTaskId) {
                    void navigate({ to: "/board", search: { task: submittedTaskId } });
                  }
                }}
              >
                View the task
              </Button>
              <Button
                onClick={() => {
                  resetAll();
                }}
              >
                Submit another
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
