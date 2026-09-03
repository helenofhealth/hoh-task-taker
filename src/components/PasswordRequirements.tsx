import { Check, X } from "lucide-react";

import { PASSWORD_RULES } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

/** Live checklist showing which password rules the typed value already satisfies. */
export function PasswordRequirements({ value, className }: { value: string; className?: string }) {
  return (
    <ul className={cn("space-y-1 text-xs", className)}>
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li
            key={rule.id}
            className={cn("flex items-center gap-1.5", ok ? "text-foreground" : "text-muted-foreground")}
          >
            {ok ? <Check className="size-3.5 text-[hsl(var(--complete,var(--primary)))]" /> : <X className="size-3.5" />}
            <span>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
