import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, MessageSquare, ArrowRightLeft, UserPlus, Pencil, Sparkles, AtSign } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export function NotificationBell() {
  const qc = useQueryClient();
  const fetchNotifications = useServerFn(fetchMyNotifications);
  const markAll = useServerFn(markAllNotificationsRead);
  const markOne = useServerFn(markNotificationRead);

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
    refetchInterval: 30000,
  });

  const items = notifications.data ?? [];
  const unread = items.filter((n: any) => !n.read_at);

  const markAllRead = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

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
        <ScrollArea className="max-h-96">
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          )}
          {items.map((n: any) => (
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
