import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_comment",
  title: "Add task comment",
  description: "Post a comment on a task as the signed-in user.",
  inputSchema: {
    task_id: z.string().uuid().describe("The task id."),
    body: z.string().trim().min(1).describe("Comment text."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ task_id, body }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id, body, user_id: ctx.getUserId() })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Comment added (${data.id}).` }],
      structuredContent: { comment: data },
    };
  },
});
