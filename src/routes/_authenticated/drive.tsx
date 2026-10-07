import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Folder, FolderOpen, HardDrive, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { DocumentRow } from "@/components/DocumentRow";
import { NewDriveFolderButton, PullFromDriveButton, RefreshDriveButton, SyncToDriveButton } from "@/components/GoogleDrivePicker";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment } from "@/lib/tracker";

export const Route = createFileRoute("/_authenticated/drive")({
  head: () => ({
    meta: [
      { title: "Google Drive files — Helen of Health Task Taker" },
      { name: "description", content: "Every Google Drive file linked to your tasks, grouped by client with quick previews." },
      { property: "og:title", content: "Google Drive files — Helen of Health Task Taker" },
      { property: "og:description", content: "Drive files grouped by client, with previews and search." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DrivePage,
});

type Row = Attachment & { tasks: { id: string; title: string; clients: { name: string } | null } | null };

function DrivePage() {
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Row | null>(null);
  const [openClient, setOpenClient] = useState<string | null>(null);
  const files = useQuery({
    queryKey: ["drive-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_attachments")
        .select("*, tasks(id, title, clients(name))")
        .not("drive_file_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const searching = search.trim().length > 0;

  // Client folders -> task folders -> files.
  const clients = useMemo(() => {
    const term = search.trim().toLowerCase();
    const cmap = new Map<string, { name: string; tasks: Map<string, { title: string; files: Row[] }> }>();
    for (const f of files.data ?? []) {
      const taskTitle = f.tasks?.title ?? "Untitled task";
      const clientName = f.tasks?.clients?.name ?? "No client";
      if (term && !f.file_name.toLowerCase().includes(term) && !taskTitle.toLowerCase().includes(term) && !clientName.toLowerCase().includes(term)) continue;
      const c = cmap.get(clientName) ?? { name: clientName, tasks: new Map() };
      const t = c.tasks.get(f.task_id) ?? { title: taskTitle, files: [] };
      t.files.push(f);
      c.tasks.set(f.task_id, t);
      cmap.set(clientName, c);
    }
    return [...cmap.values()]
      .map((c) => ({ ...c, tasks: [...c.tasks.values()].sort((a, b) => a.title.localeCompare(b.title)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [files.data, search]);

  const visibleClients = searching || !openClient ? clients : clients.filter((c) => c.name === openClient);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <HardDrive className="size-5" /> Google Drive
            </h1>
            <p className="text-sm text-muted-foreground">
              Drive files linked to tasks, organised by client folder. Sync works both ways: save uploads to Drive, or pull in files you put in a task's Drive folder.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RefreshDriveButton />
            <NewDriveFolderButton />
            <PullFromDriveButton />
            <SyncToDriveButton label="Save all uploads to Drive" />
          </div>
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file, task or client name"
            className="pl-9"
          />
        </div>
        {files.isLoading && <p className="text-sm text-muted-foreground">Loading files…</p>}
        {files.error && <p className="text-sm text-destructive">Could not load files.</p>}
        {!files.isLoading && clients.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {search ? "No files match your search." : "No Drive files yet. Add one from a task's Documents tab."}
          </p>
        )}

        {/* Client folder overview */}
        {!searching && !openClient && clients.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((c) => {
              const fileCount = c.tasks.reduce((n, t) => n + t.files.length, 0);
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setOpenClient(c.name)}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary"
                >
                  <Folder className="size-8 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.tasks.length} task folder{c.tasks.length === 1 ? "" : "s"} · {fileCount} file{fileCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}

        {/* Inside a client folder (or search results across all clients) */}
        {(searching || openClient) && (
          <div className="space-y-4">
            {!searching && openClient && (
              <Button variant="ghost" size="sm" onClick={() => setOpenClient(null)} className="gap-1.5">
                <FolderOpen className="size-4" /> All client folders
              </Button>
            )}
            {visibleClients.map((c) => (
              <section key={c.name} className="space-y-3">
                {(searching || clients.length > 1) && (
                  <h2 className="flex items-center gap-2 font-medium">
                    <Folder className="size-4 text-primary" /> {c.name}
                  </h2>
                )}
                {c.tasks.map((t) => (
                  <div key={c.name + t.title} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                    <h3 className="font-medium">
                      {t.title} <span className="text-xs text-muted-foreground">· {t.files.length} file{t.files.length === 1 ? "" : "s"}</span>
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {t.files.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setPreview(f)}
                          className="overflow-hidden rounded-xl border border-border bg-background text-left transition hover:border-primary"
                        >
                          <div className="pointer-events-none h-40 overflow-hidden">
                            <AttachmentPreview attachment={f} height={160} />
                          </div>
                          <p className="truncate p-2 text-sm">{f.file_name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.file_name}</DialogTitle>
          </DialogHeader>
          {preview && <DocumentRow attachment={preview} defaultOpen />}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
