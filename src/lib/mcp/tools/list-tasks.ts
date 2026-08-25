import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "List tasks",
  description:
    "List tasks the signed-in user can see, optionally filtered by status or client. Returns task id, title, status, priority, owner, dates and client.",
  inputSchema: {
    status: z
      .enum(["requested", "in_progress", "on_hold", "review", "completed"])
      .optional()
      .describe("Filter by board column/status."),
    client_id: z.string().uuid().optional().describe("Filter by client id."),
    limit: z.number().int().min(1).max(200).default(50).describe("Max tasks to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, client_id, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("tasks")
      .select("id,title,status,priority,owner_id,client_id,start_date,due_date,is_recurring,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (client_id) q = q.eq("client_id", client_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { tasks: data ?? [] },
    };
  },
});
