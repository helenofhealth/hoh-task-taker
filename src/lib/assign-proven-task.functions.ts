import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AssignProvenInput {
  provenTaskId: string;
  clientId: string;
  origin: string;
  dueDate?: string | null;
  subAccount?: string | null;
  project?: string | null;
  priority?: string | null;
}

export interface AssignProvenResult {
  ok: true;
  taskId: string;
  ghl: { pushed: boolean; taskId: string | null; error: string | null; ownAgency: boolean };
}

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

function validate(input: AssignProvenInput) {
  if (!input?.provenTaskId) throw new Error("Pick a proven task");
  if (!input?.clientId) throw new Error("Pick a client");
  if (!/^https?:\/\//.test(input.origin ?? "")) throw new Error("Invalid origin");
  const priority: Priority = (PRIORITIES as readonly string[]).includes(input.priority ?? "")
    ? (input.priority as Priority)
    : "normal";
  return {
    provenTaskId: input.provenTaskId,
    clientId: input.clientId,
    origin: input.origin,
    dueDate: (input.dueDate ?? "").trim() || null,
    subAccount: (input.subAccount ?? "").trim() || null,
    project: (input.project ?? "").trim() || null,
    priority,
  };
}

/**
 * Copies a proven task (with its subtasks, deliverables and QC checklist) into a
 * real task in the client's portal, then pushes it to GoHighLevel using the
 * client's own agency connection when they have one.
 */
export const assignProvenTaskToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<AssignProvenResult> => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (!isStaff) throw new Error("Only the team can send tasks to a client");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: proven, error: provenError } = await supabaseAdmin
      .from("proven_tasks")
      .select("id, title, category, description, subtasks, deliverables, qc_checklist, estimated_hours")
      .eq("id", data.provenTaskId)
      .single();
    if (provenError || !proven) throw new Error("Proven task not found");

    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, name, email, default_project, archived_at")
      .eq("id", data.clientId)
      .single();
    if (clientError || !client) throw new Error("Client not found");
    if (client.archived_at) throw new Error("That client is archived");

    const { data: created, error: taskError } = await supabaseAdmin
      .from("tasks")
      .insert({
        title: proven.title,
        description: proven.description ?? null,
        project: data.project ?? client.default_project ?? proven.category ?? null,
        client_id: client.id,
        status: "requested",
        priority: data.priority,
        due_date: data.dueDate,
        requested_completion_date: data.dueDate,
        source: "staff",
        approval_status: "approved",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        sub_account: data.subAccount,
        proven_task_id: proven.id,
        subtasks: (proven.subtasks as string[] | null) ?? [],
        deliverables: (proven.deliverables as string[] | null) ?? [],
        qc_checklist: (proven.qc_checklist as string[] | null) ?? [],
        estimated_hours: proven.estimated_hours ?? null,
        created_by: context.userId,
        position: Date.now(),
      })
      .select("id")
      .single();
    if (taskError || !created) throw taskError ?? new Error("Could not create the task");

    const base = data.origin.replace(/\/+$/, "");
    const link = `${base}/board?task=${encodeURIComponent(created.id)}`;

    const ghl: AssignProvenResult["ghl"] = {
      pushed: false,
      taskId: null,
      error: null,
      ownAgency: false,
    };
    const { pushBriefToGhl, resolveGhlCredentials } = await import("./ghl-push.server");
    const creds = await resolveGhlCredentials(supabaseAdmin, client.id);
    if (creds) {
      ghl.ownAgency = creds.ownAgency;
      try {
        const res = await pushBriefToGhl(
          supabaseAdmin,
          creds.apiKey,
          {
            title: proven.title,
            description: proven.description ?? null,
            subtasks: (proven.subtasks as string[] | null) ?? [],
            deliverables: (proven.deliverables as string[] | null) ?? [],
            qcChecklist: (proven.qc_checklist as string[] | null) ?? [],
            dueDate: data.dueDate,
            estimatedHours: proven.estimated_hours ?? null,
            subAccount: data.subAccount,
            clientName: client.name,
            clientEmail: client.email ?? null,
            appLink: link,
          },
          creds.locationId,
        );
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
          .eq("id", created.id);
      } catch (err) {
        ghl.error = err instanceof Error ? err.message : "GoHighLevel push failed";
        await supabaseAdmin.from("tasks").update({ ghl_sync_error: ghl.error }).eq("id", created.id);
      }
    } else {
      ghl.error = "GoHighLevel isn't connected, so the task lives in the portal only.";
    }

    await supabaseAdmin.from("task_activity").insert({
      task_id: created.id,
      actor_id: context.userId,
      kind: "system",
      detail: ghl.pushed
        ? `Sent from the proven tasks library to ${client.name} and synced to GoHighLevel`
        : `Sent from the proven tasks library to ${client.name}`,
    });

    return { ok: true, taskId: created.id as string, ghl };
  });
