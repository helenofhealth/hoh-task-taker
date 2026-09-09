import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface RefineTaskInput {
  taskId: string;
  /** Free-text instruction from the admin — optional when comments are used. */
  instruction?: string | undefined;
  /** Fold the task's discussion into the update. */
  useComments?: boolean | undefined;
}

export interface TaskUpdateProposal {
  title: string;
  description: string;
  subtasks: string[];
  deliverables: string[];
  qc_checklist: string[];
  estimated_hours: number | null;
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string | null;
  summary: string;
}

const PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Updated task title" },
    description: {
      type: "string",
      description:
        "Full updated brief for the delivery team, incorporating the requested changes and anything agreed in the discussion.",
    },
    subtasks: { type: "array", items: { type: "string" } },
    deliverables: { type: "array", items: { type: "string" } },
    qc_checklist: { type: "array", items: { type: "string" } },
    estimated_hours: { type: ["number", "null"] },
    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    due_date: {
      type: ["string", "null"],
      description: "Due date as YYYY-MM-DD, or null to leave none",
    },
    summary: {
      type: "string",
      description: "One short paragraph describing what you changed and why.",
    },
  },
  required: [
    "title",
    "description",
    "subtasks",
    "deliverables",
    "qc_checklist",
    "estimated_hours",
    "priority",
    "due_date",
    "summary",
  ],
} as const;

/** Admin-only: proposes an updated version of a task from a typed instruction
 *  and/or the task's own comment thread. Nothing is saved — the admin reviews
 *  the proposal and applies it from the task dialog. */
export const refineTaskWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RefineTaskInput) => {
    if (!input.taskId) throw new Error("Task is required");
    const instruction = input.instruction?.trim() ?? "";
    if (instruction.length > 6000) throw new Error("Instruction is too long");
    const useComments = input.useComments === true;
    if (!instruction && !useComments) {
      throw new Error("Type what to change, or let AI read the comments");
    }
    return { taskId: input.taskId, instruction, useComments };
  })
  .handler(async ({ data, context }): Promise<TaskUpdateProposal> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can update tasks with AI");

    const { data: task, error } = await context.supabase
      .from("tasks")
      .select(
        "id, title, description, priority, due_date, start_date, estimated_hours, subtasks, deliverables, qc_checklist, sub_account, project, status",
      )
      .eq("id", data.taskId)
      .single();
    if (error || !task) throw new Error("Task not found");

    let discussion = "";
    if (data.useComments) {
      const { data: comments } = await context.supabase
        .from("task_comments")
        .select("body, created_at")
        .eq("task_id", data.taskId)
        .order("created_at", { ascending: true })
        .limit(100);
      discussion = (comments ?? [])
        .map((c: any) => `- ${String(c.body ?? "").slice(0, 1200)}`)
        .join("\n")
        .slice(0, 20000);
      if (!discussion && !data.instruction) {
        throw new Error("This task has no comments to pull changes from");
      }
    }

    const t = task as any;
    const current = [
      `Title: ${t.title}`,
      `Status: ${t.status}`,
      `Priority: ${t.priority}`,
      t.project ? `Project: ${t.project}` : null,
      t.sub_account ? `GHL sub-account: ${t.sub_account}` : null,
      t.due_date ? `Due date: ${t.due_date}` : "Due date: none",
      t.estimated_hours ? `Estimated hours: ${t.estimated_hours}` : "Estimated hours: none",
      `Description:\n${t.description ?? "(empty)"}`,
      `Subtasks:\n${(t.subtasks ?? []).map((s: string) => `- ${s}`).join("\n") || "(none)"}`,
      `Deliverables:\n${(t.deliverables ?? []).map((s: string) => `- ${s}`).join("\n") || "(none)"}`,
      `QC checklist:\n${(t.qc_checklist ?? []).map((s: string) => `- ${s}`).join("\n") || "(none)"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = [
      "You are a senior GoHighLevel (GHL) delivery lead maintaining tasks in an agency task tracker.",
      "Update the existing task below. Keep everything that is still correct, and only change what the instruction and the discussion call for.",
      "Return the COMPLETE updated task (full description, full lists) — not a diff.",
      "Estimated hours are for a mid-experienced GHL expert, in 0.5 increments.",
      "Today's date is " + new Date().toISOString().slice(0, 10) + ".",
      "",
      "=== Current task ===",
      current,
      data.instruction ? `\n=== Requested changes (typed by an admin) ===\n${data.instruction}` : null,
      discussion ? `\n=== Task discussion (comments, oldest first) ===\n${discussion}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const { callResponses } = await import("./ai-responses.server");
    const output = await callResponses(apiKey, {
      model: "openai/gpt-5.6-sol",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      text: {
        format: {
          type: "json_schema",
          name: "task_update",
          strict: true,
          schema: PROPOSAL_SCHEMA,
        },
      },
    });

    let proposal: TaskUpdateProposal;
    try {
      proposal = JSON.parse(output) as TaskUpdateProposal;
    } catch {
      throw new Error("The AI returned an unreadable update — please try again");
    }
    if (proposal.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(proposal.due_date)) {
      proposal.due_date = null;
    }
    return proposal;
  });
