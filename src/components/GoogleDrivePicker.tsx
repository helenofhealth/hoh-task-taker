import { useState } from "react";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CloudDownload, CloudUpload, FolderPlus, HardDrive, Loader2, RefreshCw, Search, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  attachDriveFile,
  completeDriveConnect,
  disconnectDrive,
  driveStatus,
  searchDriveFiles,
  startDriveConnect,
  syncFilesToDrive,
  pullFilesFromDrive,
  refreshDriveFiles,
  createDriveFolder,
} from "@/lib/google-drive.functions";

function waitForOAuth(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== "google_drive" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("Google Drive connection failed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The Google window closed before finishing."));
    }, 500);
  });
}

export function GoogleDrivePicker({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const statusFn = useServerFn(driveStatus);
  const startFn = useServerFn(startDriveConnect);
  const completeFn = useServerFn(completeDriveConnect);
  const disconnectFn = useServerFn(disconnectDrive);
  const searchFn = useServerFn(searchDriveFiles);
  const attachFn = useServerFn(attachDriveFile);

  const status = useQuery({ queryKey: ["drive-status"], queryFn: () => statusFn(), enabled: open });
  const files = useQuery({
    queryKey: ["drive-files", submitted],
    queryFn: () => searchFn({ data: { query: submitted } }),
    enabled: open && !!status.data?.connected,
  });
  const reconnect = !!files.data?.reconnectRequired;
  const connected = !!status.data?.connected && !reconnect;

  const connect = useMutation({
    mutationFn: async () => {
      const popup = window.open("", "lovable-oauth", "width=600,height=720");
      if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
      let code: string | null;
      try {
        const { authorizationUrl } = await startFn();
        const done = waitForOAuth(popup);
        popup.location.href = authorizationUrl;
        code = await done;
      } catch (e) {
        popup.close();
        throw e;
      }
      if (code) await completeFn({ data: { code } });
    },
    onSuccess: () => {
      toast.success(reconnect ? "Reconnected to Google Drive" : "Google Drive connected");
      qc.invalidateQueries({ queryKey: ["drive-status"] });
      qc.invalidateQueries({ queryKey: ["drive-files"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Google Drive disconnected");
      qc.invalidateQueries({ queryKey: ["drive-status"] });
      qc.removeQueries({ queryKey: ["drive-files"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attach = useMutation({
    mutationFn: (fileId: string) => attachFn({ data: { taskId, fileId } }),
    onSuccess: (r) => {
      toast.success(`Linked "${r.name}" from Google Drive`);
      qc.invalidateQueries({ queryKey: ["attachments", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <HardDrive className="mr-2 size-4" />
        From Google Drive
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add from Google Drive</DialogTitle>
            <DialogDescription>Pick a file to link to this task. It opens in Google Drive.</DialogDescription>
          </DialogHeader>
          {status.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !connected ? (
            <div className="space-y-3 py-4 text-center">
              <p className="text-sm text-muted-foreground">
                {reconnect
                  ? "Your Google Drive access needs to be renewed."
                  : "Connect your own Google Drive once to pick files from it."}
              </p>
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {reconnect ? "Reconnect Google Drive" : "Connect Google Drive"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(query);
                }}
              >
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your Drive" />
                <Button type="submit" variant="outline" size="icon" aria-label="Search">
                  <Search className="size-4" />
                </Button>
              </form>
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {files.isLoading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {files.data?.files.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No files found.</p>
                )}
                {files.data?.files.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    disabled={attach.isPending}
                    onClick={() => attach.mutate(f.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left text-sm hover:bg-muted disabled:opacity-60"
                  >
                    {f.iconLink ? <img src={f.iconLink} alt="" className="size-4" /> : <HardDrive className="size-4" />}
                    <span className="truncate">{f.name}</span>
                    {f.modifiedTime && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {new Date(f.modifiedTime).toLocaleDateString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                  <Unplug className="mr-2 size-4" />
                  Disconnect Drive
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Copies app-uploaded documents (one task, or all visible tasks) into the user's Google Drive. */
export function SyncToDriveButton({ taskId, label = "Save to Drive" }: { taskId?: string; label?: string }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(driveStatus);
  const syncFn = useServerFn(syncFilesToDrive);
  const startFn = useServerFn(startDriveConnect);
  const completeFn = useServerFn(completeDriveConnect);
  const sync = useMutation({
    mutationFn: async () => {
      const { connected } = await statusFn();
      if (!connected) {
        const popup = window.open("", "lovable-oauth", "width=600,height=720");
        if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
        try {
          const { authorizationUrl } = await startFn();
          const done = waitForOAuth(popup);
          popup.location.href = authorizationUrl;
          const code = await done;
          if (code) await completeFn({ data: { code } });
        } catch (e) {
          popup.close();
          throw e;
        }
      }
      return unwrap(await syncFn({ data: taskId ? { taskId } : {} }));
    },
    onSuccess: (r) => {
      if (r.synced === 0 && r.failed === 0) toast.success("Everything is already saved in Google Drive");
      else
        toast.success(
          `Saved ${r.synced} file${r.synced === 1 ? "" : "s"} to Google Drive` +
            (r.failed ? ` · ${r.failed} failed` : "") +
            (r.remaining ? ` · ${r.remaining} left, press again` : ""),
        );
      qc.invalidateQueries({ queryKey: ["attachments"] });
      qc.invalidateQueries({ queryKey: ["drive-library"] });
      qc.invalidateQueries({ queryKey: ["drive-status"] });
    },
    onError: (e: Error) => onDriveError(e),
  });
  const onDriveError = useDriveErrorHandler(() => sync.mutate());
  return (
    <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
      {sync.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CloudUpload className="mr-2 size-4" />}
      {label}
    </Button>
  );
}

/** Opens Google consent in a popup and saves the connection. Must run from a click. */
function useDriveConnectPopup() {
  const startFn = useServerFn(startDriveConnect);
  const completeFn = useServerFn(completeDriveConnect);
  return async () => {
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
    try {
      const { authorizationUrl } = await startFn();
      const done = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await done;
      if (code) await completeFn({ data: { code } });
    } catch (e) {
      popup.close();
      throw e;
    }
  };
}

function unwrap<T>(r: T | { reconnectRequired: true }): T {
  if (r && typeof r === "object" && "reconnectRequired" in r) {
    throw new Error("Your Google Drive access needs to be renewed. Reconnect and try again.");
  }
  return r as T;
}

const isRenewError = (e: Error) => /needs to be renewed/i.test(e.message);

/** Error handler: offers a one-click Reconnect when Drive access expired, then retries. */
function useDriveErrorHandler(retry: () => void) {
  const qc = useQueryClient();
  const connect = useDriveConnectPopup();
  return (e: Error) => {
    if (!isRenewError(e)) {
      toast.error(e.message);
      return;
    }
    toast.error("Your Google Drive access needs to be renewed.", {
      duration: 15000,
      action: {
        label: "Reconnect",
        onClick: () => {
          connect()
            .then(() => {
              toast.success("Reconnected to Google Drive");
              qc.invalidateQueries({ queryKey: ["drive-status"] });
              retry();
            })
            .catch((err: Error) => toast.error(err.message));
        },
      },
    });
  };
}

/** Returns a function that makes sure the signed-in user has connected Drive (opens Google if not). */
function useEnsureDrive() {
  const statusFn = useServerFn(driveStatus);
  const connect = useDriveConnectPopup();
  return async () => {
    const { connected } = await statusFn();
    if (connected) return;
    await connect();
  };
}

/** Imports files placed in "Helen of Health Task Taker/<task name>" folders in Drive. */
export function PullFromDriveButton() {
  const qc = useQueryClient();
  const ensure = useEnsureDrive();
  const pullFn = useServerFn(pullFilesFromDrive);
  const pull = useMutation({
    mutationFn: async () => {
      await ensure();
      return unwrap(await pullFn());
    },
    onSuccess: (r) => {
      toast.success(
        r.imported
          ? `Brought in ${r.imported} new file${r.imported === 1 ? "" : "s"} from Google Drive`
          : "No new files found in your task folders",
        r.unmatchedFolders
          ? { description: `${r.unmatchedFolders} folder(s) didn't match a task name and were skipped.` }
          : undefined,
      );
      qc.invalidateQueries({ queryKey: ["attachments"] });
      qc.invalidateQueries({ queryKey: ["drive-library"] });
    },
    onError: (e: Error) => onDriveError(e),
  });
  const onDriveError = useDriveErrorHandler(() => pull.mutate());
  return (
    <Button variant="outline" onClick={() => pull.mutate()} disabled={pull.isPending}>
      {pull.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CloudDownload className="mr-2 size-4" />}
      Pull from Drive
    </Button>
  );
}

/** Re-checks Drive now: resets files deleted in Drive (so they can be saved again) and pulls in new ones. */
export function RefreshDriveButton() {
  const qc = useQueryClient();
  const ensure = useEnsureDrive();
  const refreshFn = useServerFn(refreshDriveFiles);
  const pullFn = useServerFn(pullFilesFromDrive);
  const run = useMutation({
    mutationFn: async () => {
      await ensure();
      const r = unwrap(await refreshFn());
      const p = unwrap(await pullFn());
      return { ...r, imported: p.imported };
    },
    onSuccess: (r) => {
      const parts = [
        r.imported ? `${r.imported} new from Drive` : null,
        r.reset ? `${r.reset} deleted in Drive — use Save to Drive to upload again` : null,
        r.removed ? `${r.removed} removed link${r.removed === 1 ? "" : "s"} cleared` : null,
      ].filter(Boolean);
      toast.success("Google Drive refreshed", { description: parts.length ? parts.join(" · ") : "Everything is up to date." });
      qc.invalidateQueries({ queryKey: ["attachments"] });
      qc.invalidateQueries({ queryKey: ["drive-library"] });
    },
    onError: (e: Error) => onDriveError(e),
  });
  const onDriveError = useDriveErrorHandler(() => run.mutate());
  return (
    <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
      <RefreshCw className={`mr-2 size-4 ${run.isPending ? "animate-spin" : ""}`} />
      Refresh
    </Button>
  );
}

/** Creates a folder in Drive. With taskId, creates that task's folder (named after the task). */
export function NewDriveFolderButton({ taskId }: { taskId?: string }) {
  const ensure = useEnsureDrive();
  const createFn = useServerFn(createDriveFolder);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      await ensure();
      return unwrap(await createFn({ data: taskId ? { taskId } : { name } }));
    },
    onSuccess: (r) => {
      setOpen(false);
      setName("");
      toast.success(`Folder "${r.name}" is ready in Google Drive`, {
        action: { label: "Open", onClick: () => window.open(r.url, "_blank", "noopener") },
      });
    },
    onError: (e: Error) => onDriveError(e),
  });
  const onDriveError = useDriveErrorHandler(() => create.mutate());
  if (taskId) {
    return (
      <Button variant="outline" onClick={() => create.mutate()} disabled={create.isPending}>
        {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FolderPlus className="mr-2 size-4" />}
        Task folder in Drive
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FolderPlus className="mr-2 size-4" /> New folder
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Google Drive folder</DialogTitle>
            <DialogDescription>Created inside your "Helen of Health Task Taker" folder.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="drive-folder-name">Folder name</Label>
              <Input id="drive-folder-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
            </div>
            <Button type="submit" className="w-full" disabled={!name.trim() || create.isPending}>
              {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create folder
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
