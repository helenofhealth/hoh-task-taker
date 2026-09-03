import logoAsset from "@/assets/wire.png.asset.json";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { initials, useMe } from "@/hooks/useAuth";

const nav = [
  { to: "/board", label: "Board" },
  { to: "/time-report", label: "Time report" },
  { to: "/clients", label: "Clients", staffOnly: true },
  { to: "/team", label: "Team members", staffOnly: true },
  { to: "/credit-history", label: "Credit history", staffOnly: true },
  { to: "/settings", label: "Settings" },
];

export function AppShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const navigate = useNavigate();
  const me = useMe();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const name = me.profile?.full_name || me.email || "You";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/board" className="flex items-center gap-2.5">
            <img
              src={logoAsset.url}
              alt="Helen of Health Task Taker"
              className="size-9 rounded-xl object-contain bg-card p-1"
            />
            <span className="text-lg font-semibold">Helen of Health Task Taker</span>
          </Link>

          <nav className="flex items-center gap-1 rounded-full bg-muted p-1">
            {nav.filter((item) => !item.staffOnly || me.isStaff).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === item.to
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {actions}
            <NotificationBell />
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary-soft text-xs font-semibold text-accent-foreground">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Sign out"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth", search: { next: undefined } });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
