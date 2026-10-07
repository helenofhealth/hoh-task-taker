import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Square, Timer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  elapsedMinutes,
  formatHours,
  pauseTimer,
  resumeTimer,
  roundMinutes,
  stopTimer,
  type Task,
  type TimeEntry,
} from "@/lib/tracker";

interface Props {
  entries: TimeEntry[];
  tasks: Task[];
  onOpenTask?: (task: Task) => void;
}

/** Live bar on the board showing every running timer, so tracked time is
 *  visible without opening the task. Ticks every 15 seconds. */
export function ActiveTimerBar({ entries, tasks, onOpenTask }: Props) {
  const qc = useQueryClient();
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const running = entries.filter((e) => !e.ended_at);

  useEffect(() => {
    if (running.length === 0) return;
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, [running.length]);

  if (running.length === 0) return null;

  const refresh = () => void qc.invalidateQueries({ queryKey: ["time_entries"] });

  const act = async (entry: TimeEntry, action: "pause" | "resume" | "stop") => {
    setBusy(entry.id + action);
    try {
      if (action === "pause") {
        await pauseTimer(entry.id);
        toast.success("Timer paused — nothing logged yet");
      } else if (action === "resume") {
        await resumeTimer(entry);
        toast.success("Timer resumed");
      } else {
        const raw = elapsedMinutes(entry.started_at, entry.paused_at);
        await stopTimer(entry.id);
        toast.success(`Logged ${formatHours(roundMinutes(raw) / 60)} (rounded to 15 min)`);
      }
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Timer action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-5 flex flex-col gap-2">
      {running.map((e) => {
        const task = tasks.find((t) => t.id === e.task_id);
        const mins = elapsedMinutes(e.started_at, e.paused_at);
        const paused = Boolean(e.paused_at);
        return (
          <div
            key={e.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-primary-soft p-4"
          >
            <Timer className={`size-5 text-primary ${paused ? "" : "animate-pulse"}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {task?.title ?? "Untitled task"}
                {paused && <span className="ml-2 text-xs font-normal text-muted-foreground">(paused)</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatHours(mins / 60)} elapsed · will log {formatHours(roundMinutes(mins) / 60)}
              </p>
            </div>
            {task && onOpenTask && (
              <Button variant="ghost" size="sm" onClick={() => onOpenTask(task)}>
                Open task
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void act(e, paused ? "resume" : "pause")}
            >
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={busy !== null}
              onClick={() => void act(e, "stop")}
            >
              <Square className="size-4" />
              Stop & log
            </Button>
          </div>
        );
      })}
    </div>
  );
}
