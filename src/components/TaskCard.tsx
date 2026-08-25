import { CalendarDays, MessageSquare, Repeat, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { displayName, initials } from "@/hooks/useAuth";
import { formatDuration, type Profile, type Task } from "@/lib/tracker";

interface Props {
  task: Task;
  profiles: Profile[];
  clientName?: string;
  trackedMinutes: number;
  commentCount: number;
  runningMinutes?: number | null;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}

const priorityLabel: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export function TaskCard({
  task,
  profiles,
  clientName,
  trackedMinutes,
  commentCount,
  runningMinutes,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
}: Props) {
  const owner = displayName(profiles, task.owner_id);

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group w-full cursor-grab rounded-xl border border-border bg-card p-3 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {clientName && (
          <Badge variant="secondary" className="rounded-md text-[10px] uppercase tracking-wide">
            {clientName}
          </Badge>
        )}
        {(task.priority === "high" || task.priority === "urgent") && (
          <Badge className="rounded-md bg-primary-soft text-[10px] uppercase tracking-wide text-accent-foreground">
            {priorityLabel[task.priority]}
          </Badge>
        )}
        {task.is_recurring && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Repeat className="size-3" /> {task.recurrence || "Recurring"}
          </span>
        )}
      </div>

      <h4 className="mt-2 text-sm font-semibold leading-snug">{task.title}</h4>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <Avatar className="size-6">
          <AvatarFallback className="bg-primary-soft text-[10px] font-semibold text-accent-foreground">
            {initials(owner)}
          </AvatarFallback>
        </Avatar>
        {task.due_date && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {new Date(task.due_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </span>
        )}
        {commentCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" />
            {commentCount}
          </span>
        )}
        <span
          className={`ml-auto inline-flex items-center gap-1 font-medium ${
            runningMinutes != null ? "text-primary" : ""
          }`}
        >
          <Timer className={`size-3.5 ${runningMinutes != null ? "animate-pulse" : ""}`} />
          {formatDuration(trackedMinutes)}
        </span>
      </div>
    </button>
  );
}
