import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_task_status",
  title: "Move task to a status",
  description:
    "Move a task between board columns: requested, in_progress, review or completed.",
  inputSchema: {
    task_id: z.string().uuid().describe("The task id."),
    status: z
      .enum(["requested", "in_progress", "review", "completed"])
      .describe("Target status/column."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ task_id, status }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", task_id)
      .select("id,title,status")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Task "${data.title}" moved to ${data.status}.` }],
      structuredContent: { task: data },
    };
  },
});
