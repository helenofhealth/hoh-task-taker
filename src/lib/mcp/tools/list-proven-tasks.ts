import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_proven_tasks",
  title: "List proven tasks",
  description:
    "List active proven-task templates (GHL playbooks) with their subtasks, deliverables and expert hour estimates. Use category to filter.",
  inputSchema: {
    category: z.string().optional().describe("Filter by category name (case-insensitive substring)."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("proven_tasks")
      .select("id, title, category, estimated_hours, subtasks, deliverables, qc_checklist, description")
      .eq("status", "active")
      .order("category")
      .order("title");
    if (input.category) query = query.ilike("category", `%${input.category}%`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [
        { type: "text", text: `${data.length} proven task${data.length === 1 ? "" : "s"}` },
      ],
      structuredContent: { provenTasks: data },
    };
  },
});
