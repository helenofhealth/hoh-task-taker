import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  MessageSquare,
  ArrowRightLeft,
  UserPlus,
  Pencil,
  Sparkles,
  AtSign,
  Search,
  Loader2,
  CheckCheck,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMe } from "@/hooks/useAuth";
import {
  NOTIFICATIONS_PAGE_SIZE,
  fetchMyNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsRead,
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
  const fetchUnreadCount = useServerFn(fetchUnreadNotificationCount);
  const markAll = useServerFn(markAllNotificationsRead);
  const markOne = useServerFn(markNotificationRead);
  const markMany = useServerFn(markNotificationsRead);

  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce the search box so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const notifications = useInfiniteQuery({
    queryKey: ["notifications", "list", search],
    queryFn: ({ pageParam }) =>
      fetchNotifications({ data: { q: search, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === NOTIFICATIONS_PAGE_SIZE
        ? pages.reduce((total, p) => total + p.length, 0)
        : undefined,
  });

  const unreadCount = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => fetchUnreadCount(),
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

  const items = (notifications.data?.pages ?? []).flat();
  const unreadTotal = unreadCount.data ?? items.filter((n: any) => !n.read_at).length;

  const filtered = items.filter((n: any) => {
    if (readFilter === "unread" && n.read_at) return false;
    if (kindFilter === "comment" && !COMMENT_KINDS.has(n.kind)) return false;
    if (kindFilter === "status" && !STATUS_KINDS.has(n.kind)) return false;
    return true;
  });
  const filteredUnreadIds = filtered.filter((n: any) => !n.read_at).map((n: any) => n.id);
  const filtersActive = search !== "" || readFilter !== "all" || kindFilter !== "all";

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const markAllRead = useMutation({ mutationFn: () => markAll(), onSuccess: invalidate });
  const markShownRead = useMutation({
    mutationFn: (ids: string[]) => markMany({ data: { ids } }),
    onSuccess: invalidate,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: invalidate,
  });

  const filterButton = (active: boolean, label: string, onClick: () => void) => (
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
          {unreadTotal > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadTotal > 9 ? "9+" : unreadTotal}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadTotal > 0 && (
            <button
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="border-b border-border px-4 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search notifications…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
          {filterButton(readFilter === "all", "All", () => setReadFilter("all"))}
          {filterButton(readFilter === "unread", `Unread (${unreadTotal})`, () => setReadFilter("unread"))}
          <span className="mx-1 h-4 w-px bg-border" />
          {filterButton(kindFilter === "all", "Any type", () => setKindFilter("all"))}
          {filterButton(kindFilter === "comment", "Comments", () => setKindFilter("comment"))}
          {filterButton(kindFilter === "status", "Status changes", () => setKindFilter("status"))}
        </div>
        {filtersActive && filteredUnreadIds.length > 0 && (
          <div className="border-b border-border px-4 py-2">
            <button
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              onClick={() => markShownRead.mutate(filteredUnreadIds)}
              disabled={markShownRead.isPending}
            >
              <CheckCheck className="size-3.5" />
              Mark shown as read ({filteredUnreadIds.length})
            </button>
          </div>
        )}
        <ScrollArea className="max-h-96">
          {notifications.isLoading && (
            <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          )}
          {!notifications.isLoading && filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {items.length === 0 && !search
                ? "No notifications yet."
                : "Nothing matches your search or filters."}
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
          {notifications.hasNextPage && (
            <div className="px-4 py-2.5 text-center">
              <button
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                onClick={() => notifications.fetchNextPage()}
                disabled={notifications.isFetchingNextPage}
              >
                {notifications.isFetchingNextPage && <Loader2 className="size-3 animate-spin" />}
                Load older notifications
              </button>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
