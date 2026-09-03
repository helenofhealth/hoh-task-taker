import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OnboardingState {
  clientId: string | null;
  clientName: string | null;
  profileDone: boolean;
  hoursReviewed: boolean;
  firstTaskDone: boolean;
  tourDone: boolean;
  completedAt: string | null;
  welcomeEmailSentAt: string | null;
}

const STEP_COLUMN = {
  profile: "profile_done",
  hours: "hours_reviewed",
  first_task: "first_task_done",
  tour: "tour_done",
} as const;

export type OnboardingStep = keyof typeof STEP_COLUMN;

type Row = {
  client_id: string | null;
  profile_done: boolean;
  hours_reviewed: boolean;
  first_task_done: boolean;
  tour_done: boolean;
  completed_at: string | null;
  welcome_email_sent_at: string | null;
};

const COLUMNS =
  "client_id, profile_done, hours_reviewed, first_task_done, tour_done, completed_at, welcome_email_sent_at";

function toState(row: Row, clientName: string | null): OnboardingState {
  return {
    clientId: row.client_id,
    clientName,
    profileDone: row.profile_done,
    hoursReviewed: row.hours_reviewed,
    firstTaskDone: row.first_task_done,
    tourDone: row.tour_done,
    completedAt: row.completed_at,
    welcomeEmailSentAt: row.welcome_email_sent_at,
  };
}

/**
 * Reads (and lazily creates) the signed-in person's onboarding checklist.
 * On first visit it also sends the welcome email, so a new client can get
 * going without an admin walking them through the portal.
 */
export const startOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { origin: string }) => {
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    return { origin: input.origin.replace(/\/+$/, "") };
  })
  .handler(async ({ data, context }): Promise<OnboardingState> => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("client_id, full_name, phone, email")
      .eq("id", userId)
      .maybeSingle();
    const clientId = (profile?.client_id as string | null) ?? null;

    let clientName: string | null = null;
    if (clientId) {
      const { data: client } = await supabase
        .from("clients")
        .select("name, business_name")
        .eq("id", clientId)
        .maybeSingle();
      clientName = (client?.business_name as string | null) || (client?.name as string | null) || null;
    }

    let { data: row } = await supabase
      .from("client_onboarding")
      .select(COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (!row) {
      const { data: created, error } = await supabase
        .from("client_onboarding")
        .insert({
          user_id: userId,
          client_id: clientId,
          profile_done: Boolean(profile?.full_name),
        })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      row = created;
    } else if (clientId && row.client_id !== clientId) {
      const { data: updated } = await supabase
        .from("client_onboarding")
        .update({ client_id: clientId })
        .eq("user_id", userId)
        .select(COLUMNS)
        .single();
      if (updated) row = updated;
    }

    // A client counts the "request your first task" step as done as soon as
    // their workspace has any task, however it was created.
    if (row && !row.first_task_done && clientId) {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .is("deleted_at", null);
      if ((count ?? 0) > 0) {
        const { data: updated } = await supabase
          .from("client_onboarding")
          .update({ first_task_done: true })
          .eq("user_id", userId)
          .select(COLUMNS)
          .single();
        if (updated) row = updated;
      }
    }

    const email = (profile?.email as string | null) ?? null;
    if (row && !row.welcome_email_sent_at && email) {
      try {
        const { sendClientWelcomeEmail } = await import("./invite-client.server");
        await sendClientWelcomeEmail(
          email,
          (profile?.full_name as string | null) ?? undefined,
          clientName,
          `${data.origin}/onboarding`,
        );
        const { data: updated } = await supabase
          .from("client_onboarding")
          .update({ welcome_email_sent_at: new Date().toISOString() })
          .eq("user_id", userId)
          .select(COLUMNS)
          .single();
        if (updated) row = updated;
      } catch (err) {
        // A failed welcome email must never block the setup steps.
        console.error("Welcome email failed", err);
      }
    }

    return toState(row as Row, clientName);
  });

/** Marks one setup step complete (and optionally saves the profile details). */
export const completeOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { step: OnboardingStep; fullName?: string; phone?: string | null }) => {
      if (!(input.step in STEP_COLUMN)) throw new Error("Unknown onboarding step");
      return {
        step: input.step,
        fullName: input.fullName?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
      };
    },
  )
  .handler(async ({ data, context }): Promise<OnboardingState> => {
    const { supabase, userId } = context;

    if (data.step === "profile") {
      if (!data.fullName) throw new Error("Please tell us your name");
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: data.fullName, phone: data.phone ?? null })
        .eq("id", userId);
      if (error) throw error;
    }

    const column = STEP_COLUMN[data.step];
    const patch = {
      profile_done: column === "profile_done" ? true : undefined,
      hours_reviewed: column === "hours_reviewed" ? true : undefined,
      first_task_done: column === "first_task_done" ? true : undefined,
      tour_done: column === "tour_done" ? true : undefined,
    };
    const { data: row, error } = await supabase
      .from("client_onboarding")
      .update(patch)
      .eq("user_id", userId)
      .select(COLUMNS)
      .single();
    if (error) throw error;

    let current = row as Row;
    const allDone =
      current.profile_done && current.hours_reviewed && current.first_task_done && current.tour_done;
    if (allDone && !current.completed_at) {
      const { data: finished } = await supabase
        .from("client_onboarding")
        .update({ completed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .select(COLUMNS)
        .single();
      if (finished) current = finished as Row;
    }

    let clientName: string | null = null;
    if (current.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("name, business_name")
        .eq("id", current.client_id)
        .maybeSingle();
      clientName = (client?.business_name as string | null) || (client?.name as string | null) || null;
    }

    return toState(current, clientName);
  });
