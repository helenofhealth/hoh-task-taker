import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";

import { getGhlStatus, syncGhlSubAccounts } from "@/lib/ghl.functions";
import {
  connectClientGhl,
  disconnectClientGhl,
  getClientGhlStatus,
} from "@/lib/client-ghl.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/useAuth";

/** GoHighLevel integration status. Staff manage the agency connection; clients see
 *  status only, and can connect their own agency when they have one. */
export function GhlSettingsCard() {
  const me = useMe();
  const qc = useQueryClient();
  const getStatus = useServerFn(getGhlStatus);
  const sync = useServerFn(syncGhlSubAccounts);
  const getOwnStatus = useServerFn(getClientGhlStatus);
  const connectOwn = useServerFn(connectClientGhl);
  const disconnectOwn = useServerFn(disconnectClientGhl);

  const [showForm, setShowForm] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [locationId, setLocationId] = useState("");

  const status = useQuery({
    queryKey: ["ghl-status"],
    queryFn: () => getStatus(),
  });

  const ownStatus = useQuery({
    queryKey: ["ghl-client-status"],
    queryFn: () => getOwnStatus({ data: {} }),
    enabled: !me.isStaff,
  });

  const syncNow = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.synced} sub-account${r.synced === 1 ? "" : "s"} from GoHighLevel`);
      void qc.invalidateQueries({ queryKey: ["ghl-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveOwn = useMutation({
    mutationFn: () => connectOwn({ data: { apiKey, locationId } }),
    onSuccess: (r) => {
      toast.success(
        r.agencyName ? `Connected your agency (${r.agencyName})` : "Your agency is connected",
      );
      setApiKey("");
      setLocationId("");
      setShowForm(false);
      void qc.invalidateQueries({ queryKey: ["ghl-client-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeOwn = useMutation({
    mutationFn: () => disconnectOwn({ data: {} }),
    onSuccess: () => {
      toast.success("Your agency connection was removed");
      void qc.invalidateQueries({ queryKey: ["ghl-client-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = status.data;
  const own = ownStatus.data;
  // A client with their own agency key is connected, even if the team-level key isn't set.
  const effectiveConnected = Boolean(data?.connected || own?.connected);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Link2 className="size-4 text-muted-foreground" /> GoHighLevel integration
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {me.isStaff
          ? "Connect your agency account so request forms can pick from your real sub-account names. Nothing is written back into GoHighLevel — tasks stay in this portal."
          : "Connecting your agency only pulls in your sub-account names, so you can pick the right one when you send a request. Nothing is created or changed inside your GoHighLevel account."}
      </p>

      <div className="mt-4 space-y-3 text-sm">
        {status.isLoading && <p className="text-muted-foreground">Checking connection…</p>}
        {data && (
          <>
            <p>
              Status:{" "}
              {effectiveConnected ? (
                <span className="font-medium text-status-completed">Connected</span>
              ) : (
                <span className="font-medium text-warning">Not connected</span>
              )}
            </p>
            {!effectiveConnected && me.isStaff && (
              <p className="text-xs text-muted-foreground">
                Add your agency-level GoHighLevel API key as the <code>GHL_API_KEY</code> secret.
                As soon as it's saved, the sync below pulls your real sub-account names into the
                request form dropdown.
              </p>
            )}
            {!effectiveConnected && !me.isStaff && (
              <p className="text-xs text-muted-foreground">
                Your team is still setting up the GoHighLevel connection. You can keep sending
                requests — you'll be able to pick a sub-account once it's connected.
              </p>
            )}
            {effectiveConnected && !me.isStaff && (
              <p className="text-xs text-muted-foreground">
                {own?.connected
                  ? "Your own agency's sub-accounts are available in the request form."
                  : "Sub-account names are available in the request form."}
              </p>
            )}

            {!me.isStaff && (
              <div className="rounded-xl border border-border bg-primary-soft/50 p-3">
                <p className="text-sm font-medium">Your own agency</p>
                {own?.connected ? (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Connected{own.agencyName ? ` — ${own.agencyName}` : ""}
                      {own.connectedAt
                        ? ` on ${new Date(own.connectedAt).toLocaleDateString()}`
                        : ""}
                      . Your sub-account names are pulled from your own agency.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setShowForm((v) => !v)}
                      >
                        <RefreshCw className="mr-1.5 size-4" /> Replace API key
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeOwn.mutate()}
                        disabled={removeOwn.isPending}
                      >
                        {removeOwn.isPending ? (
                          <Loader2 className="mr-1.5 size-4 animate-spin" />
                        ) : (
                          <Unplug className="mr-1.5 size-4" />
                        )}
                        Disconnect
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Have your own GoHighLevel agency? Connect it here to pick from your own
                      sub-accounts when you send a request. We never write into your account.
                    </p>
                    {!showForm && (
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={() => setShowForm(true)}
                        disabled={ownStatus.isLoading}
                      >
                        <Link2 className="mr-1.5 size-4" /> Connect my agency
                      </Button>
                    )}
                  </>
                )}

                {showForm && (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveOwn.mutate();
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="ghl-key" className="text-xs">
                        Agency API key
                      </Label>
                      <Input
                        id="ghl-key"
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Paste your agency-level API key"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ghl-location" className="text-xs">
                        Default sub-account ID (optional)
                      </Label>
                      <Input
                        id="ghl-location"
                        value={locationId}
                        onChange={(e) => setLocationId(e.target.value)}
                        placeholder="Leave blank to use your first sub-account"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your key is stored securely on the server and is never shown again. Find it in
                      GoHighLevel under Settings → Business Profile → API key.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" type="submit" disabled={saveOwn.isPending}>
                        {saveOwn.isPending ? (
                          <Loader2 className="mr-1.5 size-4 animate-spin" />
                        ) : (
                          <Link2 className="mr-1.5 size-4" />
                        )}
                        Save connection
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowForm(false);
                          setApiKey("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
            {data.connected && me.isStaff && (
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
