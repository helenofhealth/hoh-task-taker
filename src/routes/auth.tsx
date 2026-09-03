import logoAsset from "@/assets/wire.png.asset.json";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

import { requestPasswordReset } from "@/lib/reset-password.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
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
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tasks.helenofhealth.com/auth" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Sign in — Helen of Health Task Taker" },
      { name: "twitter:description", content: "Access your client task board and time reports." },
    ],
    links: [{ rel: "canonical", href: "https://tasks.helenofhealth.com/auth" }],
  }),

  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const redirectTarget = safeNext(next) ?? "/board";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [resetBusy, setResetBusy] = useState(false);

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
  const [googleBusy, setGoogleBusy] = useState(false);

  async function signInWithGoogle() {
    setGoogleBusy(true);
    try {
      // Remember where the user meant to go; the OAuth flow must return to a
      // public same-origin URL, never straight into a protected route.
      sessionStorage.setItem("post-auth-redirect", redirectTarget);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      window.location.href = redirectTarget;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setGoogleBusy(false);
    }
  }


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
            <PasswordInput
              id="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              maxLength={72}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === "signup" ? "Create account" : "Sign in"}
          </Button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={googleBusy}
            onClick={signInWithGoogle}
          >
            {googleBusy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.64v3h3.86c2.26-2.09 3.56-5.17 3.56-8.88z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.96-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
                />
              </svg>
            )}
            Continue with Google
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
