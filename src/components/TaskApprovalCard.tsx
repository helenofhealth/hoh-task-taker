import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  approveTaskRequest,
  pushTaskToGhl,
  rejectTaskRequest,
} from "@/lib/task-approval.functions";
import type { Task } from "@/lib/tracker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/useAuth";

/** Admin approval / rejection step for client-requested tasks. */
export function TaskApprovalCard({ task }: { task: Task }) {
  const me = useMe();
  const qc = useQueryClient();
  const approveFn = useServerFn(approveTaskRequest);
  const rejectFn = useServerFn(rejectTaskRequest);
  const pushFn = useServerFn(pushTaskToGhl);
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const status = task.approval_status ?? "not_required";
  const refresh = () => void qc.invalidateQueries({ queryKey: ["tasks"] });

  const approve = useMutation({
    mutationFn: () => approveFn({ data: { taskId: task.id, origin: window.location.origin } }),
    onSuccess: (r) => {
      refresh();
      toast.success(
        r.ghl.pushed
          ? "Approved — task created in GoHighLevel and the client was notified"
          : r.emailed
            ? "Approved — the client has been emailed"
            : "Request approved",
      );
      if (r.ghl.error) toast.error(`GoHighLevel: ${r.ghl.error}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: () =>
      rejectFn({ data: { taskId: task.id, origin: window.location.origin, reason } }),
    onSuccess: () => {
      refresh();
      setShowReject(false);
      setReason("");
      toast.success("Sent back to the client with your notes");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retry = useMutation({
    mutationFn: () => pushFn({ data: { taskId: task.id, origin: window.location.origin } }),
    onSuccess: () => {
      refresh();
      toast.success("Task created in GoHighLevel");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (status === "not_required" || !me.isStaff) return null;

  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-primary-soft p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        {status === "pending" && <Clock className="size-4 text-warning" />}
        {status === "approved" && <CheckCircle2 className="size-4 text-status-completed" />}
        {status === "rejected" && <XCircle className="size-4 text-status-urgent" />}
        {status === "pending" && "Awaiting admin approval"}
        {status === "approved" && "Request approved"}
        {status === "rejected" && "Sent back to the client"}
      </p>

      {status === "rejected" && task.rejection_reason && (
        <p className="text-xs text-muted-foreground">Reason: {task.rejection_reason}</p>
      )}
      {status === "approved" && (
        <p className="text-xs text-muted-foreground">
          {task.ghl_task_id
            ? `Created in GoHighLevel${task.ghl_synced_at ? ` on ${new Date(task.ghl_synced_at).toLocaleString()}` : ""}.`
            : task.ghl_sync_error
              ? `GoHighLevel push failed: ${task.ghl_sync_error}`
              : "Not pushed to GoHighLevel."}
        </p>
      )}

      {!me.isAdmin ? (
        <p className="text-xs text-muted-foreground">Only admins can approve or reject requests.</p>
      ) : (
        <div className="space-y-2">
          {status !== "approved" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
                {approve.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 size-4" />
                )}
                Approve &amp; notify client
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowReject((v) => !v)}
                disabled={reject.isPending}
              >
                <XCircle className="mr-1.5 size-4" /> Reject
              </Button>
            </div>
          )}
          {showReject && status !== "approved" && (
            <div className="space-y-1.5">
              <Label htmlFor={`reject-${task.id}`}>What does the client need to change?</Label>
              <Textarea
                id={`reject-${task.id}`}
                rows={3}
                value={reason}
                maxLength={1000}
                placeholder="e.g. We need the funnel copy and the sub-account name before we can start."
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={() => reject.mutate()}
                disabled={reject.isPending || reason.trim().length < 5}
              >
                {reject.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Send back to client
              </Button>
            </div>
          )}
          {status === "approved" && !task.ghl_task_id && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => retry.mutate()}
              disabled={retry.isPending}
            >
              {retry.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-4" />
              )}
              Create in GoHighLevel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
