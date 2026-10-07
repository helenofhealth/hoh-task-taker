import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HardDrive, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
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
      { name: "description", content: "Every Google Drive file linked to your tasks, grouped by task with quick previews." },
      { property: "og:title", content: "Google Drive files — Helen of Health Task Taker" },
      { property: "og:description", content: "Drive files grouped by task, with previews and search." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DrivePage,
});

type Row = Attachment & { tasks: { id: string; title: string } | null };

function DrivePage() {
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Row | null>(null);
  const files = useQuery({
    queryKey: ["drive-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_attachments")
        .select("*, tasks(id, title)")
        .not("drive_file_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, { title: string; files: Row[] }>();
    for (const f of files.data ?? []) {
      const title = f.tasks?.title ?? "Untitled task";
      if (term && !f.file_name.toLowerCase().includes(term) && !title.toLowerCase().includes(term)) continue;
      const g = map.get(f.task_id) ?? { title, files: [] };
      g.files.push(f);
      map.set(f.task_id, g);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [files.data, search]);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <HardDrive className="size-5" /> Google Drive
            </h1>
            <p className="text-sm text-muted-foreground">
              All Drive files linked to tasks, grouped by task. Sync works both ways: save uploads to Drive, or pull in files you put in a task's Drive folder.
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
            placeholder="Search by file or task name"
            className="pl-9"
          />
        </div>
        {files.isLoading && <p className="text-sm text-muted-foreground">Loading files…</p>}
        {files.error && <p className="text-sm text-destructive">Could not load files.</p>}
        {!files.isLoading && groups.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {search ? "No files match your search." : "No Drive files yet. Add one from a task's Documents tab."}
          </p>
        )}
        {groups.map((g) => (
          <section key={g.title + g.files[0]?.task_id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="font-medium">
              {g.title} <span className="text-xs text-muted-foreground">· {g.files.length} file{g.files.length === 1 ? "" : "s"}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.files.map((f) => (
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
          </section>
        ))}
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
