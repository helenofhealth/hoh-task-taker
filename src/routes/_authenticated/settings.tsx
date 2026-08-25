import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Mail } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Switch } from "@/components/ui/switch";
import { useMe } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Notification settings — Helen of Health Task Taker" },
      { name: "description", content: "Control which task events send you email and in-app notifications." },
    ],
  }),
});

type Prefs = {
  email_comments: boolean;
  email_mentions: boolean;
  email_status: boolean;
  email_assignments: boolean;
  inapp_comments: boolean;
  inapp_mentions: boolean;
  inapp_status: boolean;
  inapp_assignments: boolean;
};

const DEFAULTS: Prefs = {
  email_comments: true,
  email_mentions: true,
  email_status: true,
  email_assignments: true,
  inapp_comments: true,
  inapp_mentions: true,
  inapp_status: true,
  inapp_assignments: true,
};

const CATEGORIES: { key: keyof Omit<Prefs, never> extends never ? never : string; emailKey: keyof Prefs; inappKey: keyof Prefs; label: string; description: string }[] = [
  { key: "comments", emailKey: "email_comments", inappKey: "inapp_comments", label: "Comments", description: "New comments and replies on tasks you follow" },
  { key: "mentions", emailKey: "email_mentions", inappKey: "inapp_mentions", label: "Mentions", description: "When someone @mentions you in a comment" },
  { key: "status", emailKey: "email_status", inappKey: "inapp_status", label: "Status & updates", description: "Status changes and edits to title, dates, or priority" },
  { key: "assignments", emailKey: "email_assignments", inappKey: "inapp_assignments", label: "Assignments", description: "New tasks, owner assignments, and follower additions" },
];

function SettingsPage() {
  const me = useMe();
  const queryClient = useQueryClient();

  const prefsQuery = useQuery({
    queryKey: ["notification-preferences", me.userId],
    enabled: !!me.userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", me.userId!)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...DEFAULTS, ...data } : DEFAULTS;
    },
  });

  const save = useMutation({
    mutationFn: async (next: Prefs) => {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: me.userId!, ...next }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Notification preferences saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const prefs = (prefsQuery.data ?? DEFAULTS) as Prefs;

  const toggle = (key: keyof Prefs, value: boolean) => {
    save.mutate({ ...prefs, [key]: value });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Notification settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which task events notify you, and how. Changes save automatically.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border bg-muted/50 px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Event</span>
            <span className="flex w-16 items-center justify-center gap-1"><Mail className="size-3.5" /> Email</span>
            <span className="flex w-16 items-center justify-center gap-1"><Bell className="size-3.5" /> In-app</span>
          </div>
          {CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-5 py-4 last:border-0"
            >
              <div>
                <p className="text-sm font-medium">{cat.label}</p>
                <p className="text-xs text-muted-foreground">{cat.description}</p>
              </div>
              <div className="flex w-16 justify-center">
                <Switch
                  checked={prefs[cat.emailKey]}
                  onCheckedChange={(v) => toggle(cat.emailKey, v)}
                  disabled={prefsQuery.isLoading}
                  aria-label={`${cat.label} email notifications`}
                />
              </div>
              <div className="flex w-16 justify-center">
                <Switch
                  checked={prefs[cat.inappKey]}
                  onCheckedChange={(v) => toggle(cat.inappKey, v)}
                  disabled={prefsQuery.isLoading}
                  aria-label={`${cat.label} in-app notifications`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
