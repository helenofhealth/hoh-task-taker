import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { getGhlStatus, syncGhlSubAccounts } from "@/lib/ghl.functions";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useAuth";

/** GoHighLevel integration status + sub-account sync (staff only). */
export function GhlSettingsCard() {
  const me = useMe();
  const qc = useQueryClient();
  const getStatus = useServerFn(getGhlStatus);
  const sync = useServerFn(syncGhlSubAccounts);

  const status = useQuery({
    queryKey: ["ghl-status"],
    queryFn: () => getStatus(),
    enabled: me.isStaff,
  });

  const syncNow = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.synced} sub-account${r.synced === 1 ? "" : "s"} from GoHighLevel`);
      void qc.invalidateQueries({ queryKey: ["ghl-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!me.isStaff) return null;

  const data = status.data;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Link2 className="size-4 text-muted-foreground" /> GoHighLevel integration
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Connect your agency account so client requests pick from your real sub-accounts, and every
        request an admin approves is created as a real GoHighLevel task — brief, sub-tasks,
        deliverables and QC checklist included — inside that sub-account.
      </p>

      <div className="mt-4 space-y-3 text-sm">
        {status.isLoading && <p className="text-muted-foreground">Checking connection…</p>}
        {data && (
          <>
            <p>
              Status:{" "}
              {data.connected ? (
                <span className="font-medium text-status-completed">Connected</span>
              ) : (
                <span className="font-medium text-warning">Not connected</span>
              )}
            </p>
            {!data.connected && (
              <p className="text-xs text-muted-foreground">
                Add your agency-level GoHighLevel API key as the <code>GHL_API_KEY</code> secret.
                As soon as it's saved, this card connects, the sync below pulls your real
                sub-accounts into the request form dropdown, and approved requests are created as
                real GoHighLevel tasks.
              </p>
            )}
            {data.connected && (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => syncNow.mutate()}
                    disabled={syncNow.isPending || !me.isAdmin}
                  >
                    {syncNow.isPending ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 size-4" />
                    )}
                    Sync sub-accounts
                  </Button>
                  {data.lastSync && (
                    <span className="text-xs text-muted-foreground">
                      Last synced {new Date(data.lastSync).toLocaleString()}
                    </span>
                  )}
                </div>
                {!me.isAdmin && (
                  <p className="text-xs text-muted-foreground">Only admins can run the sync.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Synced sub-accounts appear in the client request form and decide where approved
                  tasks are created in GoHighLevel.
                </p>
                {data.subAccounts.length > 0 ? (
                  <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2 text-xs">
                    {data.subAccounts.map((s) => (
                      <li key={s.id}>{s.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No sub-accounts synced yet — run the sync to pull them in.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
