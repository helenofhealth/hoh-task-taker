import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ApprovalInput {
  taskId: string;
  origin: string;
  /** Required when rejecting: what the client needs to change. */
  reason?: string | undefined;
}

export interface ApprovalResult {
  ok: true;
  approvalStatus: "approved" | "rejected";
  emailed: boolean;
}

function validate(input: ApprovalInput) {
  if (!input.taskId) throw new Error("Task is required");
  if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
  return input;
}

async function requireAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Only admins can approve or reject requests");
}

const TASK_SELECT =
  "id, title, description, subtasks, deliverables, qc_checklist, estimated_hours, due_date, requested_completion_date, sub_account, client_id, approval_status, clients(name, email)";

/** Approves a requested task and confirms it to the client. */
export const approveTaskRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<ApprovalResult> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: task, error } = await supabaseAdmin
      .from("tasks")
      .select(TASK_SELECT)
      .eq("id", data.taskId)
      .single();
    if (error || !task) throw new Error("Task not found");

    const client = (task.clients as { name: string; email: string | null } | null) ?? null;
    const base = data.origin.replace(/\/+$/, "");
    const link = `${base}/board?task=${encodeURIComponent(task.id)}`;

    await supabaseAdmin
      .from("tasks")
      .update({
        approval_status: "approved",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", task.id);

    await supabaseAdmin.from("task_activity").insert({
      task_id: task.id,
      actor_id: context.userId,
      kind: "status",
      detail: "Request approved",
    });

    let emailed = false;
    if (client?.email) {
      try {
        const { sendTaskApprovalEmail } = await import("./invite-client.server");
        await sendTaskApprovalEmail(
          client.email,
          client.name,
          task.title,
          ((task.subtasks as string[] | null) ?? []).slice(0, 20),
          task.due_date ?? task.requested_completion_date ?? null,
          link,
        );
        emailed = true;
      } catch (err) {
        console.error("Approval email failed:", err);
      }
    }

    return { ok: true, approvalStatus: "approved", emailed };
  });

/** Rejects a requested task with a reason and tells the client what to change. */
export const rejectTaskRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ApprovalInput) => {
    const ok = validate(input);
    if (!ok.reason || ok.reason.trim().length < 5) {
      throw new Error("Tell the client what needs changing (at least a short reason)");
    }
    return { ...ok, reason: ok.reason.trim().slice(0, 1000) };
  })
  .handler(async ({ data, context }): Promise<ApprovalResult> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: task, error } = await supabaseAdmin
      .from("tasks")
      .select(TASK_SELECT)
      .eq("id", data.taskId)
      .single();
    if (error || !task) throw new Error("Task not found");

    const client = (task.clients as { name: string; email: string | null } | null) ?? null;
    const base = data.origin.replace(/\/+$/, "");
    const link = `${base}/board?task=${encodeURIComponent(task.id)}`;

    await supabaseAdmin
      .from("tasks")
      .update({
        approval_status: "rejected",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        rejection_reason: data.reason ?? null,
      })
      .eq("id", task.id);

    await supabaseAdmin.from("task_activity").insert({
      task_id: task.id,
      actor_id: context.userId,
      kind: "status",
      detail: `Request sent back to the client: ${data.reason ?? ""}`.slice(0, 400),
    });

    let emailed = false;
    if (client?.email) {
      try {
        const { sendTaskRejectionEmail } = await import("./invite-client.server");
        await sendTaskRejectionEmail(
          client.email,
          client.name,
          task.title,
          data.reason ?? "",
          link,
        );
        emailed = true;
      } catch (err) {
        console.error("Rejection email failed:", err);
      }
    }

    return { ok: true, approvalStatus: "rejected", emailed };
  });

