import { useQuery } from "@tanstack/react-query";
import { FileQuestion, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment } from "@/lib/tracker";

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const PDF = /\.pdf$/i;
const TEXT = /\.(txt|csv|md|json|log)$/i;
const VIDEO = /\.(mp4|webm|mov)$/i;
const AUDIO = /\.(mp3|wav|m4a|ogg)$/i;

/** Inline preview for a task document — Google Drive embed or the uploaded file itself. */
export function AttachmentPreview({ attachment, height = 420 }: { attachment: Attachment; height?: number }) {
  const driveId = attachment.drive_file_id && attachment.source === "google_drive" ? attachment.drive_file_id : null;
  const signed = useQuery({
    queryKey: ["attachment-url", attachment.id],
    enabled: !driveId,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("task-files").createSignedUrl(attachment.file_path, 3600);
      if (error || !data) throw error ?? new Error("No preview");
      return data.signedUrl;
    },
  });

  if (driveId) {
    return (
      <iframe
        title={attachment.file_name}
        src={`https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`}
        className="w-full rounded-lg border border-border bg-background"
        style={{ height }}
        allow="autoplay"
      />
    );
  }
  if (signed.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border" style={{ height: 120 }}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const url = signed.data;
  const name = attachment.file_name;
  const mime = attachment.mime_type ?? "";
  if (!url) return <NoPreview />;
  if (IMAGE.test(name) || mime.startsWith("image/"))
    return <img src={url} alt={name} className="max-h-[420px] w-full rounded-lg border border-border object-contain" />;
  if (PDF.test(name) || mime === "application/pdf" || TEXT.test(name) || mime.startsWith("text/"))
    return <iframe title={name} src={url} className="w-full rounded-lg border border-border bg-background" style={{ height }} />;
  if (VIDEO.test(name) || mime.startsWith("video/"))
    return <video src={url} controls className="w-full rounded-lg border border-border" />;
  if (AUDIO.test(name) || mime.startsWith("audio/")) return <audio src={url} controls className="w-full" />;
  if (attachment.drive_file_id)
    return (
      <iframe
        title={name}
        src={`https://drive.google.com/file/d/${encodeURIComponent(attachment.drive_file_id)}/preview`}
        className="w-full rounded-lg border border-border bg-background"
        style={{ height }}
      />
    );
  return <NoPreview />;
}

function NoPreview() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      <FileQuestion className="size-5" />
      No preview for this file type. Save it to Google Drive to preview Word, Excel and other office files here.
    </div>
  );
}
