import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_task",
  title: "Get task details",
  description:
    "Get one task with its description, followers, comments, attachments and logged time entries.",
  inputSchema: {
    task_id: z.string().uuid().describe("The task id (from list_tasks)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const [task, comments, entries, followers] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", task_id).maybeSingle(),
      supabase
        .from("task_comments")
        .select("id,user_id,body,created_at")
        .eq("task_id", task_id)
        .order("created_at"),
      supabase
        .from("time_entries")
        .select("id,user_id,started_at,ended_at,minutes,note,limit_override,override_minutes")
        .eq("task_id", task_id)
        .order("started_at", { ascending: false }),
      supabase.from("task_followers").select("user_id").eq("task_id", task_id),
    ]);
    if (task.error) return { content: [{ type: "text", text: task.error.message }], isError: true };
    if (!task.data) return { content: [{ type: "text", text: "Task not found" }], isError: true };
    const result = {
      task: task.data,
      comments: comments.data ?? [],
      time_entries: entries.data ?? [],
      followers: (followers.data ?? []).map((f: { user_id: string }) => f.user_id),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
