import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  RefreshCw,
  Timer,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  elapsedMinutes,
  formatHours,
  hoursFromMinutes,
  roundedPreview,
  type Task,
  type TimeEntry,
} from "@/lib/tracker";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function fmtDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * Live GoHighLevel timeline for a single task: tracked hours vs the estimate,
 * start / end dates and the snapshot + sub-account the work belongs to. Rows
 * refresh live from the running timer and from realtime task / time-entry
 * changes, so what the team sees always matches GHL.
 */
export function GhlTimeline({ task, entries }: { task: Task; entries: TimeEntry[] }) {
  const qc = useQueryClient();
  const [, setTick] = useState(0);

  const taskEntries = useMemo(
    () => entries.filter((e) => e.task_id === task.id),
    [entries, task.id],
  );
  const running = taskEntries.find((e) => !e.ended_at);

  // Live ticking while a timer runs on this task.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Realtime: any change to this task or its time entries refreshes the panel.
  useEffect(() => {
    const channel = supabase
      .channel(`ghl-timeline-${task.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `id=eq.${task.id}` },
        () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries", filter: `task_id=eq.${task.id}` },
        () => void qc.invalidateQueries({ queryKey: ["time_entries"] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [task.id, qc]);

  const loggedMinutes = taskEntries.reduce((s, e) => s + (e.minutes ?? 0), 0);
  const liveMinutes = running ? roundedPreview(elapsedMinutes(running.started_at)) : 0;
  const loggedHours = hoursFromMinutes(loggedMinutes);
  const liveHours = hoursFromMinutes(loggedMinutes + liveMinutes);
  const estimate = task.estimated_hours ?? null;
  const pct = estimate && estimate > 0 ? Math.min(100, (liveHours / estimate) * 100) : null;
  const overEstimate = estimate != null && estimate > 0 && liveHours > estimate;

  const firstEntry = [...taskEntries].sort((a, b) =>
    a.started_at.localeCompare(b.started_at),
  )[0];
  const lastEnded = [...taskEntries]
    .filter((e) => e.ended_at)
    .sort((a, b) => (a.ended_at ?? "").localeCompare(b.ended_at ?? ""))
    .at(-1);

  const snapshots = (task.deliverables ?? []).filter((d) => /snapshot/i.test(d));

  const rows: { icon: React.ReactNode; label: string; value: string; hint?: string | undefined }[] = [];

  const startValue =
    fmtDate(task.start_date) ??
    (firstEntry ? `${fmtDateTime(firstEntry.started_at)} (first tracked)` : null);
  if (startValue)
    rows.push({ icon: <CalendarClock className="size-4" />, label: "Start", value: startValue });

  const endValue =
    fmtDate(task.due_date) ??
    fmtDate(task.requested_completion_date) ??
    (lastEnded ? `${fmtDateTime(lastEnded.ended_at)} (last tracked)` : null);
  if (endValue)
    rows.push({
      icon: <CalendarCheck2 className="size-4" />,
      label: task.due_date ? "Due" : task.requested_completion_date ? "Requested by" : "Last worked",
      value: endValue,
    });

  if (task.sub_account)
    rows.push({
      icon: <Layers className="size-4" />,
      label: "Sub-account",
      value: task.sub_account,
      hint: task.ghl_location_id ? `Location ${task.ghl_location_id}` : undefined,
    });

  if (snapshots.length)
    rows.push({
      icon: <Layers className="size-4" />,
      label: snapshots.length === 1 ? "Snapshot" : "Snapshots",
      value: snapshots.join(", "),
    });

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-medium">
          <Timer className="size-4 text-status-progress" />
          GoHighLevel timeline
        </p>
        {running ? (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="size-3 animate-spin" /> Live — timer running
          </Badge>
        ) : task.ghl_task_id ? (
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="size-3 text-status-completed" /> Synced to GHL
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <RefreshCw className="size-3" /> Not in GHL yet
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-4" /> Hours tracked
          </span>
          <span className="font-medium">
            {formatHours(liveHours)}
            {estimate != null ? ` / ~${formatHours(estimate)} est.` : ""}
            {running && liveMinutes > 0 ? ` (incl. ${formatHours(hoursFromMinutes(liveMinutes))} in progress)` : ""}
          </span>
        </div>
        {pct != null && <Progress value={pct} />}
        {overEstimate && (
          <p className="flex items-center gap-1.5 text-xs text-status-urgent">
            <AlertTriangle className="size-3.5" />
            {formatHours(liveHours - (estimate ?? 0))} over the estimate
          </p>
        )}
        {!running && loggedMinutes > 0 && (
          <p className="text-xs text-muted-foreground">
            {formatHours(loggedHours)} saved in 15-minute increments across {taskEntries.length}{" "}
            {taskEntries.length === 1 ? "session" : "sessions"}.
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="space-y-1.5 border-t border-border pt-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {r.icon}
                {r.label}
              </span>
              <span className="text-right">
                {r.value}
                {r.hint && (
                  <span className="block text-xs text-muted-foreground">{r.hint}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        {task.ghl_task_id
          ? `GoHighLevel task ${task.ghl_task_id}${task.ghl_synced_at ? ` · last synced ${fmtDateTime(task.ghl_synced_at)}` : ""}.`
          : task.ghl_sync_error
            ? `Last GoHighLevel push failed: ${task.ghl_sync_error}`
            : "This task will be created in GoHighLevel once it is approved."}
      </p>
    </div>
  );
}
