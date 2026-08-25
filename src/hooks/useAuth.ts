import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfiles, fetchRoles, type AppRole, type Profile } from "@/lib/tracker";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null as User | null, loading };
}

export function useMe() {
  const { user } = useSession();
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const roles = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });

  const myRoles = (roles.data ?? []).filter((r) => r.user_id === user?.id).map((r) => r.role);
  const profile: Profile | undefined = (profiles.data ?? []).find((p) => p.id === user?.id);

  return {
    userId: user?.id ?? null,
    email: user?.email ?? null,
    profile,
    profiles: profiles.data ?? [],
    roles: myRoles as AppRole[],
    isAdmin: myRoles.includes("admin"),
    isStaff: myRoles.includes("admin") || myRoles.includes("member"),
    isClient: myRoles.includes("client"),
  };
}

export function displayName(profiles: Profile[], id: string | null | undefined) {
  if (!id) return "Unassigned";
  const p = profiles.find((x) => x.id === id);
  return p?.full_name || p?.email || "Someone";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
