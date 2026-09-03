import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Link2, Mail, Moon } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Notification settings — Helen of Health Task Taker" },
      { name: "description", content: "Control which task events send you email and in-app notifications." },
      { property: "og:title", content: "Notification settings — Helen of Health Task Taker" },
      { property: "og:description", content: "Control which task events send you email and in-app notifications." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tasks.helenofhealth.com/settings" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://tasks.helenofhealth.com/settings" }],
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
  email_digest: boolean;
  quiet_enabled: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  quiet_timezone: string;
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
  email_digest: false,
  quiet_enabled: false,
  quiet_start: "20:00",
  quiet_end: "08:00",
  quiet_timezone: "Europe/Athens",
};

const TIMEZONES = [
  "Europe/Athens",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

type BoolKeys = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs];

const CATEGORIES: { key: string; emailKey: BoolKeys; inappKey: BoolKeys; label: string; description: string }[] = [
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
      const merged = data ? { ...DEFAULTS, ...data } : DEFAULTS;
      // Postgres time columns come back as HH:MM:SS; time inputs need HH:MM.
      if (typeof merged.quiet_start === "string") merged.quiet_start = merged.quiet_start.slice(0, 5);
      if (typeof merged.quiet_end === "string") merged.quiet_end = merged.quiet_end.slice(0, 5);
      return merged;
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

        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Daily digest email</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Instead of a separate email for every comment or status change, get one summary
                email at 9:00 AM, Monday to Friday. On Mondays it covers everything since Friday.
                Mentions and assignments still arrive instantly. No email is sent on quiet days.
              </p>
            </div>
            <Switch
              checked={prefs.email_digest}
              onCheckedChange={(v) => toggle("email_digest", v)}
              disabled={prefsQuery.isLoading}
              aria-label="Daily digest email"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Moon className="size-4 text-muted-foreground" /> Quiet hours
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hold back instant notification emails during these hours. In-app notifications
                still appear in the bell, and the daily digest is unaffected.
              </p>
            </div>
            <Switch
              checked={prefs.quiet_enabled}
              onCheckedChange={(v) => toggle("quiet_enabled", v)}
              disabled={prefsQuery.isLoading}
              aria-label="Quiet hours"
            />
          </div>
          {prefs.quiet_enabled && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="q-start">From</Label>
                <Input
                  id="q-start"
                  type="time"
                  value={prefs.quiet_start ?? "20:00"}
                  onChange={(e) => save.mutate({ ...prefs, quiet_start: e.target.value || "20:00" })}
                  disabled={prefsQuery.isLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-end">Until</Label>
                <Input
                  id="q-end"
                  type="time"
                  value={prefs.quiet_end ?? "08:00"}
                  onChange={(e) => save.mutate({ ...prefs, quiet_end: e.target.value || "08:00" })}
                  disabled={prefsQuery.isLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select
                  value={prefs.quiet_timezone}
                  onValueChange={(v) => save.mutate({ ...prefs, quiet_timezone: v })}
                  disabled={prefsQuery.isLoading}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <ConnectedAccounts />
      </div>

    </AppShell>
  );
}

function ConnectedAccounts() {
  const queryClient = useQueryClient();

  const identitiesQuery = useQuery({
    queryKey: ["user-identities"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      return data.identities ?? [];
    },
  });

  const identities = identitiesQuery.data ?? [];
  const google = identities.find((i) => i.provider === "google");
  const canUnlink = identities.length > 1;

  const link = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/settings` },
      });
      if (error) throw error;
    },
    onError: (err: Error) =>
      toast.error(
        /manual linking/i.test(err.message)
          ? "Account linking is turned off for this workspace. Ask an administrator to enable manual identity linking."
          : err.message,
      ),
  });

  const unlink = useMutation({
    mutationFn: async () => {
      if (!google) return;
      const { error } = await supabase.auth.unlinkIdentity(google);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-identities"] });
      toast.success("Google account disconnected");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Link2 className="size-4 text-muted-foreground" /> Connected accounts
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Link Google to your existing email and password account so you can sign in either way — no
        second account is created.
      </p>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Google</p>
          <p className="text-xs text-muted-foreground">
            {identitiesQuery.isLoading
              ? "Checking…"
              : google
                ? `Connected${google.identity_data?.["email"] ? ` — ${google.identity_data["email"]}` : ""}`
                : "Not connected"}
          </p>
        </div>
        {google ? (
          <Button
            variant="outline"
            size="sm"
            disabled={!canUnlink || unlink.isPending}
            title={canUnlink ? undefined : "Set a password first so you keep a way to sign in"}
            onClick={() => unlink.mutate()}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={identitiesQuery.isLoading || link.isPending}
            onClick={() => link.mutate()}
          >
            Connect Google
          </Button>
        )}
      </div>
    </div>
  );
}
