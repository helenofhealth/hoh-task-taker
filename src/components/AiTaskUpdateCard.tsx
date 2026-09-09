import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { refineTaskWithAi, type TaskUpdateProposal } from "@/lib/refine-task.functions";
import type { Task } from "@/lib/tracker";

/** Admin-only AI helper: drafts an updated version of the task from a typed
 *  instruction and/or the task's comments, for review before saving. */
export function AiTaskUpdateCard({
  task,
  onApply,
  applying = false,
}: {
  task: Task;
  onApply: (patch: Partial<Task>) => void;
  applying?: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  const [useComments, setUseComments] = useState(true);
  const [proposal, setProposal] = useState<TaskUpdateProposal | null>(null);

  const refine = useServerFn(refineTaskWithAi);
  const draft = useMutation({
    mutationFn: async () =>
      refine({
        data: {
          taskId: task.id,
          ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
          useComments,
        },
      }),
    onSuccess: (result) => {
      setProposal(result);
      toast.success("AI drafted an update — review it before saving");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function apply() {
    if (!proposal) return;
    onApply({
      title: proposal.title,
      description: proposal.description,
      subtasks: proposal.subtasks,
      deliverables: proposal.deliverables,
      qc_checklist: proposal.qc_checklist,
      estimated_hours: proposal.estimated_hours,
      priority: proposal.priority as Task["priority"],
      due_date: proposal.due_date,
    } as Partial<Task>);
    setProposal(null);
    setInstruction("");
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-primary-soft/50 p-3">
      <Label htmlFor="ai-update" className="flex items-center gap-1.5">
        <Sparkles className="size-4 text-primary" /> Update with AI
      </Label>
      <Textarea
        id="ai-update"
        rows={3}
        value={instruction}
        maxLength={6000}
        placeholder="Type what should change — e.g. add a second follow-up email and push the due date to Friday"
        onChange={(e) => setInstruction(e.target.value)}
      />
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft">
        <Checkbox
          className="mt-0.5"
          checked={useComments}
          onCheckedChange={(v) => setUseComments(v === true)}
        />
        <span>Also pull the changes agreed in this task's comments</span>
      </label>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={draft.isPending || (!instruction.trim() && !useComments)}
        onClick={() => draft.mutate()}
      >
        <Sparkles className="mr-1.5 size-4" />
        {draft.isPending ? "Drafting…" : "Draft update"}
      </Button>

      {proposal && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
          <p className="text-xs text-muted-foreground">{proposal.summary}</p>
          <p className="font-medium">{proposal.title}</p>
          <p className="whitespace-pre-wrap text-ink-soft">{proposal.description}</p>
          {(
            [
              ["Subtasks", proposal.subtasks],
              ["Deliverables", proposal.deliverables],
              ["QC checklist", proposal.qc_checklist],
            ] as [string, string[]][]
          ).map(([label, items]) =>
            items.length > 0 ? (
              <div key={label} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-ink-soft">
                  {items.map((item, i) => (
                    <li key={`${label}-${i}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          <p className="text-xs text-muted-foreground">
            Priority: {proposal.priority}
            {proposal.due_date ? ` · due ${proposal.due_date}` : " · no due date"}
            {proposal.estimated_hours ? ` · est. ${proposal.estimated_hours}h` : ""}
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={apply} disabled={applying}>
              Apply update
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
