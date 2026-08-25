import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, MessageSquare, ArrowRightLeft, UserPlus, Pencil, Sparkles, AtSign } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMe } from "@/hooks/useAuth";
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type ReadFilter = "all" | "unread";
type KindFilter = "all" | "comment" | "status";

const COMMENT_KINDS = new Set(["comment", "mention"]);
const STATUS_KINDS = new Set(["status", "details"]);

export function NotificationBell() {
  const qc = useQueryClient();
  const me = useMe();
  const fetchNotifications = useServerFn(fetchMyNotifications);
  const markAll = useServerFn(markAllNotificationsRead);
  const markOne = useServerFn(markNotificationRead);

  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
  });

  // Real-time: refresh the list the moment a notification for this user is
  // inserted, updated, or deleted — no polling.
  useEffect(() => {
    if (!me.userId) return;
    const channel = supabase
      .channel(`notifications:${me.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${me.userId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me.userId, qc]);

  const items = notifications.data ?? [];
  const unread = items.filter((n: any) => !n.read_at);

  const filtered = items.filter((n: any) => {
    if (readFilter === "unread" && n.read_at) return false;
    if (kindFilter === "comment" && !COMMENT_KINDS.has(n.kind)) return false;
    if (kindFilter === "status" && !STATUS_KINDS.has(n.kind)) return false;
    return true;
  });

  const markAllRead = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const filterButton = (
    active: boolean,
    label: string,
    onClick: () => void,
  ) => (
    <button
      key={label}
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Notifications" className="relative">
          <Bell className="size-4" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread.length > 0 && (
            <button
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
          {filterButton(readFilter === "all", "All", () => setReadFilter("all"))}
          {filterButton(readFilter === "unread", `Unread (${unread.length})`, () => setReadFilter("unread"))}
          <span className="mx-1 h-4 w-px bg-border" />
          {filterButton(kindFilter === "all", "Any type", () => setKindFilter("all"))}
          {filterButton(kindFilter === "comment", "Comments", () => setKindFilter("comment"))}
          {filterButton(kindFilter === "status", "Status changes", () => setKindFilter("status"))}
        </div>
        <ScrollArea className="max-h-96">
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {items.length === 0 ? "No notifications yet." : "Nothing matches these filters."}
            </p>
          )}
          {filtered.map((n: any) => (
            <button
              key={n.id}
              onClick={() => !n.read_at && markRead.mutate(n.id)}
              className={`flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/60 ${
                n.read_at ? "opacity-60" : ""
              }`}
            >
              <span className="mt-0.5 rounded-full bg-primary-soft p-1.5 text-accent-foreground">
                {n.kind === "mention" ? (
                  <AtSign className="size-3.5" />
                ) : n.kind === "comment" ? (
                  <MessageSquare className="size-3.5" />
                ) : n.kind === "assigned" || n.kind === "follower_added" ? (
                  <UserPlus className="size-3.5" />
                ) : n.kind === "created" ? (
                  <Sparkles className="size-3.5" />
                ) : n.kind === "details" ? (
                  <Pencil className="size-3.5" />
                ) : (
                  <ArrowRightLeft className="size-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{n.title}</span>
                {n.body && (
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                    {n.body}
                  </span>
                )}
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {timeAgo(n.created_at)}
                </span>
              </span>
              {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
            </button>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
