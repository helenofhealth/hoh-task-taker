import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "post-auth-redirect";

/** Only same-origin absolute paths are allowed as a post-auth destination. */
export function safePath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/auth")) return null;
  return value;
}

export function rememberPostAuthPath(path: string) {
  const safe = safePath(path);
  if (safe) {
    try {
      sessionStorage.setItem(STORAGE_KEY, safe);
    } catch {
      /* storage unavailable — fall back to role-based routing */
    }
  }
}

function takeRememberedPath(): string | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    return safePath(stored);
  } catch {
    return null;
  }
}

/**
 * Where a freshly authenticated user belongs:
 * - an explicitly requested page (deep link before sign-in) wins
 * - staff (admin/member) land on the task board
 * - a client linked to one client lands in that client's workspace
 * - a client with no linked client lands on the board's client selector
 */
export async function resolvePostAuthPath(userId?: string | null): Promise<string> {
  const remembered = takeRememberedPath();
  if (remembered) return remembered;

  let id = userId ?? null;
  if (!id) {
    const { data } = await supabase.auth.getUser();
    id = data.user?.id ?? null;
  }
  if (!id) return "/auth";

  const [{ data: roles }, { data: profile }, { data: onboarding }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", id),
    supabase.from("profiles").select("client_id").eq("id", id).maybeSingle(),
    supabase.from("client_onboarding").select("completed_at").eq("user_id", id).maybeSingle(),
  ]);

  const roleList = (roles ?? []).map((r) => r.role as string);
  if (roleList.includes("admin") || roleList.includes("member")) return "/board";

  // Clients who haven't finished portal setup go straight to the guided steps.
  const finished = (onboarding as { completed_at?: string | null } | null)?.completed_at ?? null;
  if (!finished) return "/onboarding";

  const clientId = (profile as { client_id?: string | null } | null)?.client_id ?? null;
  if (clientId) return `/board?client=${encodeURIComponent(clientId)}`;

  return "/board?client=all";
}
