import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Create task",
  description:
    "Create a new task on the board. Starts in 'requested' unless a status is given. Optionally assign an owner, client, dates and priority.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Task title."),
    description: z.string().optional().describe("Task description (markdown-ish text)."),
    client_id: z.string().uuid().optional().describe("Client to bill the task to (from list_clients)."),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    status: z.enum(["requested", "in_progress", "on_hold", "review", "completed"]).default("requested"),
    owner_id: z.string().uuid().optional().describe("User id of the task owner."),
    start_date: z.string().optional().describe("Start date, YYYY-MM-DD."),
    due_date: z.string().optional().describe("Due date, YYYY-MM-DD."),
    is_recurring: z.boolean().default(false).describe("Whether the task repeats."),
    recurrence: z.string().optional().describe("Recurrence rule, e.g. 'weekly', 'monthly'."),
    sub_account: z.string().optional().describe("GHL sub-account name the work is for."),
    proven_task_id: z
      .string()
      .uuid()
      .optional()
      .describe("Proven-task template id (from list_proven_tasks) to link."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title: input.title,
        description: input.description ?? null,
        client_id: input.client_id ?? null,
        priority: input.priority,
        status: input.status,
        owner_id: input.owner_id ?? ctx.getUserId(),
        start_date: input.start_date ?? null,
        due_date: input.due_date ?? null,
        is_recurring: input.is_recurring,
        recurrence: input.recurrence ?? null,
        sub_account: input.sub_account ?? null,
        proven_task_id: input.proven_task_id ?? null,
        source: "staff",
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created task "${data.title}" (${data.id})` }],
      structuredContent: { task: data },
    };
  },
});
