import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeBalance } from "@/lib/tracker";
import type { Client, HourCredit, TimeEntry } from "@/lib/tracker";

/** Email the client once their usable balance drops to 20% or less. */
export const checkClientHourAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string; origin: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: client } = await supabase
      .from("clients")
      .select("id, name, retainer_hours, business_name, email, phone")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client?.email) return { alerted: false as const };

    const { data: credits } = await supabase
      .from("hour_credits")
      .select("*")
      .eq("client_id", data.clientId);
    const { data: entries } = await supabase
      .from("time_entries")
      .select("*, tasks!inner(client_id)")
      .eq("tasks.client_id", data.clientId);

    const balance = computeBalance(
      data.clientId,
      [client as unknown as Client],
      (credits ?? []) as unknown as HourCredit[],
      (entries ?? []) as unknown as (TimeEntry & { tasks: { client_id: string | null } | null })[],
    );

    if (balance.bought <= 0) return { alerted: false as const };
    if (balance.remaining > balance.bought * 0.2) return { alerted: false as const };

    const periodKey = `low20:${balance.nextExpiry ?? "depleted"}`;
    const { error: insertError } = await supabase.from("client_hour_alerts").insert({
      client_id: data.clientId,
      period_key: periodKey,
      remaining_hours: Math.round(balance.remaining * 100) / 100,
      bought_hours: Math.round(balance.bought * 100) / 100,
    });
    // Unique violation = already alerted for this package / retainer month.
    if (insertError) return { alerted: false as const };

    const { sendLowHoursEmail } = await import("@/lib/invite-client.server");
    await sendLowHoursEmail(
      client.email,
      client.name,
      balance.remaining,
      balance.bought,
      balance.nextExpiry,
      balance.expiresInDays,
      `${data.origin}/time-report`,
    );
    return { alerted: true as const };
  });
