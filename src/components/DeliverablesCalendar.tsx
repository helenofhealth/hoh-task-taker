import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { daysUntil, type Task } from "@/lib/tracker";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DeliverablesCalendar({
  tasks,
  onOpenTask,
}: {
  tasks: Task[];
  onOpenTask?: (task: Task) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const key = t.due_date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return map;
  }, [tasks]);

  const upcoming = useMemo(
    () =>
      tasks
        .filter((t) => t.due_date && t.status !== "completed")
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
        .slice(0, 6),
    [tasks],
  );

  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const firstWeekday = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1),
    ),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{monthLabel}</p>
          <div className="ml-auto flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Previous month"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Next month"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} />;
            const key = iso(day);
            const items = byDate.get(key) ?? [];
            const isToday = key === iso(today);
            return (
              <div
                key={key}
                className={`min-h-16 rounded-lg border p-1 text-left ${
                  isToday ? "border-primary bg-accent" : "border-border bg-card"
                }`}
              >
                <p className="text-[10px] font-medium text-muted-foreground">{day.getDate()}</p>
                <div className="mt-0.5 space-y-0.5">
                  {items.slice(0, 2).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpenTask?.(t)}
                      title={t.title}
                      className="block w-full truncate rounded bg-surface-muted px-1 py-0.5 text-left text-[10px] hover:bg-accent"
                    >
                      {t.title}
                    </button>
                  ))}
                  {items.length > 2 && (
                    <p className="px-1 text-[10px] text-muted-foreground">
                      +{items.length - 2} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold">Next deliverables</p>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing scheduled — dated tasks appear here automatically.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((t) => {
              const days = t.due_date ? daysUntil(t.due_date.slice(0, 10)) : null;
              const overdue = days !== null && days < 0;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask?.(t)}
                    className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-soft transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>due {t.due_date?.slice(0, 10)}</span>
                      <Badge
                        variant={overdue ? "destructive" : "outline"}
                        className="ml-auto text-[10px]"
                      >
                        {days === null
                          ? t.status
                          : overdue
                            ? `${Math.abs(days)}d overdue`
                            : days === 0
                              ? "today"
                              : `in ${days}d`}
                      </Badge>
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
