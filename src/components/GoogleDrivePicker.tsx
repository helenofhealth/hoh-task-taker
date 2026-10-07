import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HardDrive, Loader2, Search, Unplug } from "lucide-react";
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
