import { safeAppOrigin } from "@/lib/app-origin";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface BriefFileInput {
  /** Storage path inside the task-files bucket. */
  path: string;
  name: string;
  mime: string;
}

export interface GenerateBriefInput {
  description: string;
  subAccount?: string | undefined;
  urgency?: string | undefined;
  desiredDate?: string | undefined;
  files?: BriefFileInput[] | undefined;
}

export interface TaskBrief {
  title: string;
  description: string;
  subtasks: string[];
  deliverables: string[];
  qc_checklist: string[];
  estimated_hours: number | null;
  suggested_category: string | null;
  matched_proven_task_id: string | null;
}

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Short action-oriented task title" },
    description: {
      type: "string",
      description:
        "Detailed brief of exactly what is needed, written for the delivery team. Incorporate everything learned from the client's description and uploaded files so nobody has to open the files to understand the work.",
    },
    subtasks: { type: "array", items: { type: "string" } },
    deliverables: { type: "array", items: { type: "string" } },
    qc_checklist: { type: "array", items: { type: "string" } },
    estimated_hours: {
      type: ["number", "null"],
      description: "Hours a mid-experienced GoHighLevel expert would need",
    },
    suggested_category: { type: ["string", "null"] },
    matched_proven_task_id: { type: ["string", "null"] },
  },
  required: [
    "title",
    "description",
    "subtasks",
    "deliverables",
    "qc_checklist",
    "estimated_hours",
    "suggested_category",
    "matched_proven_task_id",
  ],
} as const;

const TEXT_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
  "application/xml",
  "text/xml",
]);
const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const SPREADSHEET_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const MAX_TEXT_CHARS = 20000;

type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_file"; filename: string; file_data: string };

/** Reads one uploaded file and returns the content parts it contributes. */
async function fileToParts(
  supabaseAdmin: any,
  file: BriefFileInput,
): Promise<{ parts: ContentPart[]; note: string }> {
  const { data: blob, error } = await supabaseAdmin.storage.from("task-files").download(file.path);
  if (error || !blob) {
    return { parts: [], note: `- ${file.name}: attached (could not be read — listed by name only)` };
  }
  const mime = file.mime || blob.type || "application/octet-stream";

  if (TEXT_MIME.has(mime) || /\.(txt|md|csv|json|html?|xml)$/i.test(file.name)) {
    const text = (await blob.text()).slice(0, MAX_TEXT_CHARS);
    return {
      parts: [{ type: "input_text", text: `--- File: ${file.name} ---\n${text}` }],
      note: `- ${file.name}: full text included`,
    };
  }
  if (IMAGE_MIME.has(mime)) {
    const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    return {
      parts: [{ type: "input_image", image_url: `data:${mime};base64,${b64}` }],
      note: `- ${file.name}: image included for review`,
    };
  }
  if (mime === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    return {
      parts: [
        { type: "input_file", filename: file.name, file_data: `data:application/pdf;base64,${b64}` },
      ],
      note: `- ${file.name}: PDF included for review`,
    };
  }
  if (SPREADSHEET_MIME.has(mime) || /\.(xlsx?|csv)$/i.test(file.name)) {
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: "buffer" });
      const text = book.SheetNames.map((name) => {
        const csv = XLSX.utils.sheet_to_csv(book.Sheets[name]!);
        return `--- Sheet: ${name} ---\n${csv}`;
      })
        .join("\n")
        .slice(0, MAX_TEXT_CHARS);
      return {
        parts: [{ type: "input_text", text: `--- Spreadsheet: ${file.name} ---\n${text}` }],
        note: `- ${file.name}: spreadsheet contents included`,
      };
    } catch {
      return { parts: [], note: `- ${file.name}: attached (spreadsheet could not be parsed)` };
    }
  }
  return {
    parts: [],
    note: `- ${file.name}: attached (${mime}; binary format — listed by name, not parsed)`,
  };
}

/** Streams a Responses API call and returns the final output text. */
async function callResponses(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 402 || res.status === 403) {
      throw new Error(
        "AI credits are unavailable right now — please ask the workspace owner to top up, then try again.",
      );
    }
    if (res.status === 429) throw new Error("The AI service is busy — please try again in a minute.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = event
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        if (json.type === "response.output_text.delta" && typeof json.delta === "string") {
          output += json.delta;
        } else if (json.type === "response.completed" && !output) {
          output = json.response?.output_text ?? "";
        } else if (json.type === "response.failed") {
          throw new Error(json.response?.error?.message ?? "AI request failed");
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return output;
}

/** AI task-brief builder: reads the client's description plus any uploaded
 *  files and produces a detailed brief with subtasks, deliverables, QC
 *  checklist and an hours estimate from a mid-experienced GHL expert. */
export const generateTaskBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GenerateBriefInput) => {
    const description = input.description?.trim();
    if (!description || description.length < 10) {
      throw new Error("Describe what you need in at least a sentence");
    }
    if (description.length > 12000) throw new Error("Description is too long");
    const files = Array.isArray(input.files) ? input.files.slice(0, 8) : [];
    return { ...input, description, files };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace");

    // Only users who can see the request's files may reference them: the
    // upload path is namespaced per user, so enforce the prefix.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safeFiles = (data.files ?? []).filter(
      (f) =>
        typeof f.path === "string" &&
        f.path.startsWith(`request-drafts/${context.userId}/`) &&
        f.path.length < 400,
    );

    const { data: library } = await supabaseAdmin
      .from("proven_tasks")
      .select("id, title, category, estimated_hours")
      .eq("status", "active")
      .limit(200);

    const parts: ContentPart[] = [];
    const notes: string[] = [];
    for (const file of safeFiles) {
      const { parts: fileParts, note } = await fileToParts(supabaseAdmin, file);
      parts.push(...fileParts);
      notes.push(note);
    }

    const libraryText = (library ?? [])
      .map((t: any) => `- ${t.id} | ${t.category} | ${t.title} (~${t.estimated_hours ?? "?"}h)`)
      .join("\n");

    const prompt = [
      "You are a senior GoHighLevel (GHL) delivery lead scoping client work for a task tracker.",
      "From the client's request (and any uploaded files) produce a complete task brief.",
      "Write the description for the delivery team: it must contain every relevant detail from the request and the files so nobody needs to open the files afterwards. Summarise file contents inline where they matter.",
      "Break the work into concrete subtasks in execution order, list the deliverables the client will receive, and a QC checklist the team must pass.",
      "Estimate the hours a mid-experienced GHL expert would need (be realistic, 0.5 increments).",
      "If the request closely matches a proven task from the library below, return its id in matched_proven_task_id; otherwise null. Suggest the best-fitting category either way.",
      "",
      `Client request: ${data.description}`,
      data.subAccount ? `GHL sub-account: ${data.subAccount}` : null,
      data.urgency ? `Urgency: ${data.urgency}` : null,
      data.desiredDate ? `Desired completion date: ${data.desiredDate}` : null,
      notes.length > 0 ? `\nUploaded files:\n${notes.join("\n")}` : null,
      `\nProven task library (id | category | title | est hours):\n${libraryText || "(empty)"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const output = await callResponses(apiKey, {
      model: "openai/gpt-5.6-sol",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...parts] }],
      text: {
        format: {
          type: "json_schema",
          name: "task_brief",
          strict: true,
          schema: BRIEF_SCHEMA,
        },
      },
    });

    let brief: TaskBrief;
    try {
      brief = JSON.parse(output) as TaskBrief;
    } catch {
      throw new Error("The AI returned an unreadable brief — please try again");
    }

    // Only trust a matched id that actually exists in the library.
    const validIds = new Set((library ?? []).map((t: any) => t.id));
    if (brief.matched_proven_task_id && !validIds.has(brief.matched_proven_task_id)) {
      brief.matched_proven_task_id = null;
    }
    return brief;
  });

interface NotifyAdminsInput {
  taskId: string;
  origin: string;
}

/** Emails every admin when a client submits a new task request. */
export const notifyAdminsTaskRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NotifyAdminsInput) => {
    if (!input.taskId) throw new Error("Task is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: canSee } = await context.supabase.rpc("can_see_task", {
      _task_id: data.taskId,
    });
    if (!canSee) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select(
        "id, title, priority, sub_account, requested_completion_date, description, clients(name)",
      )
      .eq("id", data.taskId)
      .single();
    if (!task) throw new Error("Task not found");

    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (adminRoles ?? [])
      .map((r: any) => r.user_id)
      .filter((id: string) => id !== context.userId);
    if (adminIds.length === 0) return { ok: true as const, sent: 0 };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("id", adminIds);
    const emails = (profiles ?? [])
      .map((p: any) => p.email)
      .filter((e: unknown): e is string => !!e);

    const base = data.origin;
    const link = `${base}/board?task=${encodeURIComponent(data.taskId)}`;
    const clientName = (task.clients as { name: string } | null)?.name ?? "A client";
    const lines = [
      `Client: ${clientName}`,
      task.sub_account ? `Sub-account: ${task.sub_account}` : null,
      `Urgency: ${task.priority}`,
      task.requested_completion_date
        ? `Desired completion: ${task.requested_completion_date}`
        : null,
      task.description ? `\n${String(task.description).slice(0, 600)}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const { sendTaskUpdateEmail } = await import("./invite-client.server");
    let sent = 0;
    for (const email of emails) {
      try {
        await sendTaskUpdateEmail(
          email,
          `New client request: "${task.title}"`,
          lines,
          link,
          task.title,
        );
        sent++;
      } catch (err) {
        console.error("Admin request email failed:", err);
      }
    }

    const { createNotifications, filterByPrefs } = await import("./notifications.server");
    const { inapp } = await filterByPrefs(supabaseAdmin, adminIds, "assignments");
    await createNotifications(inapp, {
      taskId: task.id,
      kind: "created",
      title: `New client request: "${task.title}"`,
      body: `${clientName} submitted a request${task.sub_account ? ` for ${task.sub_account}` : ""}.`,
    });
    return { ok: true as const, sent };
  });
