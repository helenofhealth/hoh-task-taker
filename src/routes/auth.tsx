import logoAsset from "@/assets/wire.png.asset.json";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { requestPasswordReset } from "@/lib/reset-password.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


/** Accept only same-origin relative paths (used by the OAuth consent flow). */
function safeNext(next: string | undefined): string | null {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return null;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s["next"] === "string" ? s["next"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Helen of Health Task Taker" },
      {
        name: "description",
        content: "Sign in to your Helen of Health Task Taker workspace to manage client tasks, time and hours.",
      },
      { property: "og:title", content: "Sign in — Helen of Health Task Taker" },
      { property: "og:description", content: "Access your client task board and time reports." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const redirectTarget = safeNext(next) ?? "/board";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [resetBusy, setResetBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function sendResetEmail() {
    if (!email) {
      toast.error("Enter your email address first");
      return;
    }
    setResetBusy(true);
    try {
      await requestPasswordReset({
        data: { email, origin: window.location.origin },
      });
      toast.success("Password reset email sent — check your inbox");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setResetBusy(false);
    }
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = redirectTarget;
    });
  }, [redirectTarget]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${redirectTarget}`,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        toast.success("Account created — welcome!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      window.location.href = redirectTarget;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src={logoAsset.url}
            alt="Helen of Health Task Taker"
            className="mx-auto mb-4 size-12 rounded-2xl object-contain bg-card p-1"
          />
          <h1 className="text-2xl font-semibold">Helen of Health Task Taker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Client tasks, time and hours — beautifully simple.
          </p>
        </div>

        <form onSubmit={submit} className="surface space-y-4 p-6">
          {(() => { console.log("rendered"); return null; })()}
          <button type="button" id="test-click-btn" onClick={() => console.log("react test click")}>Test click</button>
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={sendResetEmail}
                  disabled={resetBusy}
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {resetBusy ? "Sending…" : "Forgot password?"}
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="password"
                data-show={String(showPassword)}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                maxLength={72}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === "signup" ? "Create account" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        </form>
      </div>
    </main>
  );
}
