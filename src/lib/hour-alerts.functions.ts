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
    if (!client) return { alerted: false as const, teamAlerted: false as const };

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

    if (balance.bought <= 0) return { alerted: false as const, teamAlerted: false as const };
    if (balance.remaining > balance.bought * TEAM_ALERT_THRESHOLD) {
      return { alerted: false as const, teamAlerted: false as const };
    }

    const remainingHours = Math.round(balance.remaining * 100) / 100;
    const boughtHours = Math.round(balance.bought * 100) / 100;

    // --- internal team alert (independent of whether the client gets one) ---
    let teamAlerted = false;
    const teamKey = `team-low:${balance.nextExpiry ?? "depleted"}`;
    const { error: teamDupe } = await supabase.from("client_hour_alerts").insert({
      client_id: data.clientId,
      period_key: teamKey,
      remaining_hours: remainingHours,
      bought_hours: boughtHours,
    });
    if (!teamDupe) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: staffRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "member"]);
      const staffIds = (staffRoles ?? []).map((r) => r.user_id);
      const recipients: string[] = [];
      if (staffIds.length) {
        const { data: staffProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id, email")
          .in("id", staffIds);
        for (const p of staffProfiles ?? []) {
          if (p.email && !recipients.includes(p.email)) recipients.push(p.email);
        }
      }
      if (recipients.length) {
        const { sendTeamLowHoursEmail } = await import("@/lib/invite-client.server");
        await sendTeamLowHoursEmail(
          recipients,
          client.name,
          balance.remaining,
          balance.bought,
          TEAM_ALERT_THRESHOLD,
          balance.remainingBuckets.map((b) => ({
            expiry: b.expiry,
            hours: Math.round(b.hours * 100) / 100,
            free: b.free,
            retainer: b.retainer,
          })),
          `${data.origin}/clients`,
        );
        teamAlerted = true;
      }
    }

    // --- client-facing alert ---
    if (!client.email) return { alerted: false as const, teamAlerted };

    const periodKey = `low20:${balance.nextExpiry ?? "depleted"}`;
    const { error: insertError } = await supabase.from("client_hour_alerts").insert({
      client_id: data.clientId,
      period_key: periodKey,
      remaining_hours: remainingHours,
      bought_hours: boughtHours,
    });
    // Unique violation = already alerted for this package / retainer month.
    if (insertError) return { alerted: false as const, teamAlerted };

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
    return { alerted: true as const, teamAlerted };

  });
