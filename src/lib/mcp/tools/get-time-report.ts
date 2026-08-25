import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_time_report",
  title: "Client time report",
  description:
    "Hours bought vs used per client: retainer/block hours purchased, time logged (15-minute increments), remaining balance, and any limit overrides. Optionally scoped to one client.",
  inputSchema: {
    client_id: z.string().uuid().optional().describe("Restrict the report to one client."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ client_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);

    let clientsQ = supabase.from("clients").select("id,name,retainer_hours").order("name");
    if (client_id) clientsQ = clientsQ.eq("id", client_id);
    const { data: clients, error: clientsError } = await clientsQ;
    if (clientsError) return { content: [{ type: "text", text: clientsError.message }], isError: true };

    let creditsQ = supabase.from("hour_credits").select("client_id,hours,kind,effective_month");
    let entriesQ = supabase
      .from("time_entries")
      .select("minutes,limit_override,override_minutes,tasks(client_id)")
      .not("minutes", "is", null);
    if (client_id) {
      creditsQ = creditsQ.eq("client_id", client_id);
      entriesQ = entriesQ.eq("tasks.client_id", client_id);
    }
    const [{ data: credits, error: creditsError }, { data: entries, error: entriesError }] =
      await Promise.all([creditsQ, entriesQ]);
    if (creditsError) return { content: [{ type: "text", text: creditsError.message }], isError: true };
    if (entriesError) return { content: [{ type: "text", text: entriesError.message }], isError: true };

    const report = (clients ?? []).map((c: { id: string; name: string; retainer_hours: number }) => {
      const bought = (credits ?? [])
        .filter((cr: { client_id: string }) => cr.client_id === c.id)
        .reduce((s: number, cr: { hours: number }) => s + Number(cr.hours), 0);
      const mine = (entries ?? []).filter(
        (e: any) => (Array.isArray(e.tasks) ? e.tasks[0]?.client_id : e.tasks?.client_id) === c.id,
      );
      const used =
        mine.reduce((s: number, e: any) => s + (e.minutes ?? 0), 0) / 60;
      const overrides = mine.filter((e: any) => e.limit_override);
      return {
        client_id: c.id,
        client: c.name,
        retainer_hours: c.retainer_hours,
        hours_bought: Math.round(bought * 100) / 100,
        hours_used: Math.round(used * 100) / 100,
        hours_remaining: Math.round((bought - used) * 100) / 100,
        override_entries: overrides.length,
        override_minutes: overrides.reduce(
          (s: number, e: any) => s + (e.override_minutes ?? 0),
          0,
        ),
      };
    });

    return {
      content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      structuredContent: { report },
    };
  },
});
