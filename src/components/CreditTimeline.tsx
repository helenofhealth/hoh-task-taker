import { CalendarClock, CircleCheck, CircleSlash, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  creditTimeline,
  expiryLabel,
  formatHours,
  type HourCredit,
  type TimeEntry,
} from "@/lib/tracker";

interface Props {
  clientId: string;
  credits: HourCredit[];
  entries: (TimeEntry & { tasks: { client_id: string | null } | null })[];
}

const statusStyles: Record<string, string> = {
  active: "border-l-primary",
  expiring: "border-l-warning",
  expired: "border-l-muted-foreground/40",
};

/** Chronological view of a client's hour credits and when each one expires. */
export function CreditTimeline({ clientId, credits, entries }: Props) {
  const rows = creditTimeline(clientId, credits, entries);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hours have been added for this client yet.</p>;
  }

  const stillValid = rows.filter((r) => r.status !== "expired" && r.left > 0.0001);
  const validHours = stillValid.reduce((s, r) => s + r.left, 0);

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm">
        <CalendarClock className="size-4 text-primary" />
        <span className="font-semibold">{formatHours(validHours)}</span>
        <span className="text-muted-foreground">
          still valid across {stillValid.length} credit{stillValid.length === 1 ? "" : "s"}
        </span>
      </p>

      <ol className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className={`rounded-lg border border-border border-l-4 bg-card px-3 py-2 text-xs ${
              statusStyles[r.status]
            } ${r.status === "expired" ? "opacity-70" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {r.status === "expired" ? (
                <CircleSlash className="size-3.5 text-muted-foreground" />
              ) : r.status === "expiring" ? (
                <TriangleAlert className="size-3.5 text-warning" />
              ) : (
                <CircleCheck className="size-3.5 text-primary" />
              )}
              <span className="font-medium">{r.retainer ? "Retainer" : "Hour package"}</span>
              {r.free && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  Free
                </Badge>
              )}
              <span className="text-muted-foreground">
                added {r.addedOn} · {formatHours(r.hours)} granted
              </span>
              <span
                className={`ml-auto ${
                  r.status === "expiring"
                    ? "font-semibold text-warning"
                    : r.status === "expired"
                      ? "text-muted-foreground"
                      : "text-muted-foreground"
                }`}
              >
                expires {r.expiry} ({expiryLabel(r.expiresInDays)})
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-muted-foreground">
              <span>{formatHours(r.used)} used</span>
              <span className={r.left > 0.0001 && r.status !== "expired" ? "font-medium text-foreground" : ""}>
                {formatHours(r.left)} {r.status === "expired" ? "unused (lapsed)" : "left"}
              </span>
              {r.note && <span className="italic">“{r.note}”</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
