import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Check, Clock, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { CreditTimeline } from "@/components/CreditTimeline";
import { RequestTaskDialog } from "@/components/RequestTaskDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useMe } from "@/hooks/useAuth";
import {
  completeOnboardingStep,
  startOnboarding,
  type OnboardingState,
  type OnboardingStep,
} from "@/lib/onboarding.functions";
import { claimMyClientAccount } from "@/lib/self-link.functions";
import {
  computeBalance,
  fetchClients,
  fetchCredits,
  fetchTimeEntries,
  formatHours,
} from "@/lib/tracker";

const TITLE = "Get started — Helen of Health Task Taker";
const DESCRIPTION =
  "Set up your client portal in four steps: confirm your details, review your purchased hours, request your first task and learn where everything lives.";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingPage,
});

function StepShell({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={done ? "border-primary/40" : undefined}>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {done ? <Check className="size-4" /> : index}
        </span>
        <CardTitle className="text-base">{title}</CardTitle>
        {done && (
          <Badge variant="secondary" className="ml-auto">
            Done
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function OnboardingPage() {
  const me = useMe();
  const qc = useQueryClient();
  const start = useServerFn(startOnboarding);
  const completeStep = useServerFn(completeOnboardingStep);
  const claimAccount = useServerFn(claimMyClientAccount);

  const [state, setState] = useState<OnboardingState | null>(null);
  const [saving, setSaving] = useState<OnboardingStep | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const clients = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const credits = useQuery({ queryKey: ["credits"], queryFn: fetchCredits });
  const entries = useQuery({ queryKey: ["time-entries"], queryFn: fetchTimeEntries });

  const boot = useQuery({
    queryKey: ["onboarding", me.userId],
    enabled: Boolean(me.userId),
    queryFn: () => start({ data: { origin: window.location.origin } }),
  });

  useEffect(() => {
    if (boot.data) setState(boot.data);
  }, [boot.data]);

  useEffect(() => {
    setFullName((prev) => prev || me.profile?.full_name || "");
    setPhone((prev) => prev || me.profile?.phone || "");
  }, [me.profile?.full_name, me.profile?.phone]);

  const clientId = state?.clientId ?? me.profile?.client_id ?? null;
  const client = (clients.data ?? []).find((c) => c.id === clientId) ?? null;
  const balance = client
    ? computeBalance(client.id, clients.data ?? [], credits.data ?? [], entries.data ?? [])
    : null;

  const steps = [
    Boolean(state?.profileDone),
    Boolean(state?.hoursReviewed),
    Boolean(state?.firstTaskDone),
    Boolean(state?.tourDone),
  ];
  const doneCount = steps.filter(Boolean).length;

  async function save(step: OnboardingStep) {
    setSaving(step);
    try {
      const next = await completeStep({
        data:
          step === "profile"
            ? { step, fullName, phone }
            : { step },
      });
      setState(next);
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      toast.success(next.completedAt ? "You're all set up!" : "Step saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We could not save that step");
    } finally {
      setSaving(null);
    }
  }

  async function claim() {
    setClaiming(true);
    try {
      const result = await claimAccount({});
      if (!result.ok) {
        toast.error(result.message ?? "We could not connect your account");
        return;
      }
      toast.success(`Connected to ${result.clientName}`);
      await qc.invalidateQueries();
      const next = await start({ data: { origin: window.location.origin } });
      setState(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We could not connect your account");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Sparkles className="size-5 text-primary" />
            Welcome{state?.clientName ? `, ${state.clientName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">{DESCRIPTION}</p>
          <div className="flex items-center gap-3 pt-1">
            <Progress value={(doneCount / 4) * 100} className="h-2 max-w-xs" />
            <span className="text-xs text-muted-foreground">{doneCount} of 4 complete</span>
          </div>
        </div>

        {boot.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Preparing your setup steps…
          </p>
        )}

        {state?.completedAt && (
          <Card className="border-primary/50 bg-accent/40">
            <CardContent className="flex flex-wrap items-center gap-3 py-4">
              <Check className="size-5 text-primary" />
              <p className="text-sm font-medium">
                Setup complete — everything below stays available if you want to revisit it.
              </p>
              <Button asChild size="sm" className="ml-auto">
                <Link to="/portal">Go to my portal</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <StepShell index={1} title="Confirm your contact details" done={steps[0]!}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ob-name">Your name</Label>
              <Input
                id="ob-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-phone">Phone (optional)</Label>
              <Input
                id="ob-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+30 …"
              />
            </div>
          </div>
          <Button onClick={() => save("profile")} disabled={saving === "profile" || !fullName.trim()}>
            {saving === "profile" && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save details
          </Button>
        </StepShell>

        <StepShell index={2} title="Review your purchased hours" done={steps[1]!}>
          {!client && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">
                Your login isn't connected to a client workspace yet. If you were invited with this
                email address, connect it now.
              </p>
              <Button variant="outline" size="sm" onClick={claim} disabled={claiming}>
                {claiming && <Loader2 className="mr-2 size-4 animate-spin" />}
                Connect my account
              </Button>
            </div>
          )}
          {client && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Purchased hours</p>
                  <p className="text-lg font-semibold">{formatHours(balance?.bought ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Used</p>
                  <p className="text-lg font-semibold">{formatHours(balance?.used ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> Remaining
                  </p>
                  <p className="text-lg font-semibold">{formatHours(balance?.remaining ?? 0)}</p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock className="size-3" /> Your hour credits and expiry dates
                </p>
                <CreditTimeline
                  clientId={client.id}
                  credits={credits.data ?? []}
                  entries={entries.data ?? []}
                />
              </div>
              <Button onClick={() => save("hours")} disabled={saving === "hours"}>
                {saving === "hours" && <Loader2 className="mr-2 size-4 animate-spin" />}
                I've reviewed my hours
              </Button>
            </div>
          )}
        </StepShell>

        <StepShell index={3} title="Request your first task" done={steps[2]!}>
          <p className="text-sm text-muted-foreground">
            Pick a ready-made task from your library or describe what you need — the team picks it up
            from there.
          </p>
          {client && me.userId ? (
            <RequestTaskDialog client={client} userId={me.userId} balance={balance} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Connect your client workspace in step 2 to request a task.
            </p>
          )}
          {!steps[2] && client && (
            <Button variant="ghost" size="sm" onClick={() => boot.refetch()}>
              I've submitted it — refresh
            </Button>
          )}
        </StepShell>

        <StepShell index={4} title="Learn your way around" done={steps[3]!}>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Sparkles className="mt-0.5 size-4 text-primary" />
              <span>
                <strong className="text-foreground">My portal</strong> — your tasks, hours left and
                upcoming deliverables in one place.
              </span>
            </li>
            <li className="flex gap-2">
              <Clock className="mt-0.5 size-4 text-primary" />
              <span>
                <strong className="text-foreground">Time report</strong> — every minute logged
                against your tasks, in 15-minute increments.
              </span>
            </li>
            <li className="flex gap-2">
              <MessageSquare className="mt-0.5 size-4 text-primary" />
              <span>
                <strong className="text-foreground">Task comments &amp; files</strong> — open any
                task to discuss it, upload documents and follow progress.
              </span>
            </li>
            <li className="flex gap-2">
              <CalendarClock className="mt-0.5 size-4 text-primary" />
              <span>
                <strong className="text-foreground">Notifications</strong> — the bell (and email)
                tells you about status changes, comments and new deliverables.
              </span>
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save("tour")} disabled={saving === "tour"}>
              {saving === "tour" && <Loader2 className="mr-2 size-4 animate-spin" />}
              Got it — finish setup
            </Button>
            <Button asChild variant="outline">
              <Link to="/portal">Open my portal</Link>
            </Button>
          </div>
        </StepShell>
      </div>
    </AppShell>
  );
}
