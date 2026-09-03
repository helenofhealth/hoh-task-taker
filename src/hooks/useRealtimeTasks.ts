import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the task list fresh across every open session: when a team member
 * creates, edits or deletes a task, the client portal and board refresh
 * immediately instead of showing a stale card until the next reload.
 */
export function useRealtimeTasks() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        void qc.invalidateQueries({ queryKey: ["tasks"] });
        void qc.invalidateQueries({ queryKey: ["comment_counts"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
