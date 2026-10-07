import { useState } from "react";
import { CloudCheck, Download, ExternalLink, Eye, EyeOff, HardDrive, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import type { Attachment } from "@/lib/tracker";

export function DocumentRow({
  attachment: a,
  onDownload,
  defaultOpen = false,
}: {
  attachment: Attachment;
  onDownload?: (path: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isDrive = a.source === "google_drive";
  return (
    <div className="space-y-2 rounded-xl border border-border bg-background p-3 text-sm">
      <div className="flex items-center gap-3">
        {isDrive ? (
          <HardDrive className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{a.file_name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {!isDrive && a.drive_file_id && (
            <span className="flex items-center gap-1 text-status-completed" title="Saved to Google Drive">
              <CloudCheck className="size-3.5" /> In Drive
            </span>
          )}
          {isDrive ? "Google Drive" : a.size_bytes ? ` · ${Math.round(a.size_bytes / 1024)} KB` : ""}
        </span>
        <Button size="icon" variant="ghost" onClick={() => setOpen((o) => !o)} aria-label={open ? "Hide preview" : "Preview"}>
          {open ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        {a.external_url && (
          <Button size="icon" variant="ghost" asChild>
            <a href={a.external_url} target="_blank" rel="noopener noreferrer" aria-label="Open in Google Drive">
              <ExternalLink className="size-4" />
            </a>
          </Button>
        )}
        {!isDrive && onDownload && (
          <Button size="icon" variant="ghost" onClick={() => onDownload(a.file_path)} aria-label="Download">
            <Download className="size-4" />
          </Button>
        )}
      </div>
      {open && <AttachmentPreview attachment={a} />}
    </div>
  );
}
