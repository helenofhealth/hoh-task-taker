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
  ghl: { pushed: boolean; taskId: string | null; error: string | null };
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

/** Approves a requested task, pushes it to GoHighLevel and confirms to the client. */
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

    // Push a real task into GoHighLevel when the integration is connected.
    const ghl: ApprovalResult["ghl"] = { pushed: false, taskId: null, error: null };
    const { pushBriefToGhl, resolveGhlCredentials } = await import("./ghl-push.server");
    const creds = await resolveGhlCredentials(supabaseAdmin, task.client_id ?? null);
    if (creds) {
      try {
        const res = await pushBriefToGhl(supabaseAdmin, creds.apiKey, {
          title: task.title,
          description: task.description ?? null,
          subtasks: (task.subtasks as string[] | null) ?? [],
          deliverables: (task.deliverables as string[] | null) ?? [],
          qcChecklist: (task.qc_checklist as string[] | null) ?? [],
          dueDate: task.due_date ?? task.requested_completion_date ?? null,
          estimatedHours: task.estimated_hours ?? null,
          subAccount: task.sub_account ?? null,
          clientName: client?.name ?? "Client",
          clientEmail: client?.email ?? null,
          appLink: link,
        }, creds.locationId);
        ghl.pushed = true;
        ghl.taskId = res.taskId;
        await supabaseAdmin
          .from("tasks")
          .update({
            ghl_task_id: res.taskId,
            ghl_contact_id: res.contactId,
            ghl_location_id: res.locationId,
            ghl_synced_at: new Date().toISOString(),
            ghl_sync_error: null,
          })
          .eq("id", task.id);
      } catch (err) {
        ghl.error = err instanceof Error ? err.message : "GoHighLevel push failed";
        await supabaseAdmin
          .from("tasks")
          .update({ ghl_sync_error: ghl.error })
          .eq("id", task.id);
      }
    }

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
      detail: ghl.pushed
        ? "Request approved and pushed to GoHighLevel"
        : "Request approved",
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

    return { ok: true, approvalStatus: "approved", emailed, ghl };
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

    return {
      ok: true,
      approvalStatus: "rejected",
      emailed,
      ghl: { pushed: false, taskId: null, error: null },
    };
  });

/** Retries the GoHighLevel push for an already-approved task. */
export const pushTaskToGhl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
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
    const { pushBriefToGhl, resolveGhlCredentials } = await import("./ghl-push.server");
    const creds = await resolveGhlCredentials(supabaseAdmin, task.client_id ?? null);
    if (!creds) {
      throw new Error(
        "GoHighLevel isn't connected yet — connect an agency in Settings and try again.",
      );
    }
    try {
      const res = await pushBriefToGhl(supabaseAdmin, creds.apiKey, {
        title: task.title,
        description: task.description ?? null,
        subtasks: (task.subtasks as string[] | null) ?? [],
        deliverables: (task.deliverables as string[] | null) ?? [],
        qcChecklist: (task.qc_checklist as string[] | null) ?? [],
        dueDate: task.due_date ?? task.requested_completion_date ?? null,
        estimatedHours: task.estimated_hours ?? null,
        subAccount: task.sub_account ?? null,
        clientName: client?.name ?? "Client",
        clientEmail: client?.email ?? null,
        appLink: link,
      });
      await supabaseAdmin
        .from("tasks")
        .update({
          ghl_task_id: res.taskId,
          ghl_contact_id: res.contactId,
          ghl_location_id: res.locationId,
          ghl_synced_at: new Date().toISOString(),
          ghl_sync_error: null,
        })
        .eq("id", task.id);
      return { ok: true as const, taskId: res.taskId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "GoHighLevel push failed";
      await supabaseAdmin.from("tasks").update({ ghl_sync_error: message }).eq("id", task.id);
      throw new Error(message);
    }
  });
