import { auth, defineMcp, type AnyToolDefinition } from "@lovable.dev/mcp-js";
import listTasksTool from "./tools/list-tasks";
import getTaskTool from "./tools/get-task";
import createTaskTool from "./tools/create-task";
import updateTaskStatusTool from "./tools/update-task-status";
import addCommentTool from "./tools/add-comment";
import listClientsTool from "./tools/list-clients";
import getTimeReportTool from "./tools/get-time-report";

// The OAuth issuer MUST be the direct Supabase host; on publish SUPABASE_URL is
// rewritten to the proxy, which fails issuer discovery. The project ref is the
// only value that survives publish, inlined at build time.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "bloom",
  title: "Bloom",
  version: "0.1.0",
  instructions:
    "Tools for Bloom, a client task & time tracker. Use list_tasks/get_task to read work, " +
    "create_task and update_task_status to manage the board, add_comment to discuss, " +
    "list_clients and get_time_report for client hour balances.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listTasksTool,
    getTaskTool,
    createTaskTool,
    updateTaskStatusTool,
    addCommentTool,
    listClientsTool,
    getTimeReportTool,
  ],
});
