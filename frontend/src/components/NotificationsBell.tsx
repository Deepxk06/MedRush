import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Modal } from "./ui/Modal";
import { Badge } from "./ui/Badge";
import type { Notification } from "../types";
import { useAuth } from "../context/AuthContext";

const typeTone: Record<string, "slate" | "red" | "green" | "amber" | "sky"> = {
  INFO: "sky",
  SUCCESS: "green",
  WARNING: "amber",
  DANGER: "red",
  EMERGENCY: "red",
};

export function NotificationsBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<Notification[]>("/api/notifications?page_size=50")).data,
    refetchInterval: 15000,
    enabled: !!user,
  });

  const { data: unread } = useQuery({
    queryKey: ["unread"],
    queryFn: async () => (await api.get<{ count: number }>("/api/notifications/unread-count")).data,
    refetchInterval: 10000,
    enabled: !!user,
  });

  useEffect(() => {
    if (!open) return;
    api.put("/api/notifications/read-all").catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["unread"] });
  }, [open, queryClient]);

  const items = notifications ?? [];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {(unread?.count ?? 0) > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">
            {unread!.count}
          </span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Notifications" wide>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No notifications yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id} className="py-3">
                <div className="flex items-center gap-2">
                  <Badge tone={typeTone[n.type] ?? "slate"}>{n.type}</Badge>
                  <p className="text-sm font-bold text-slate-900">{n.title}</p>
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                {n.message && <p className="mt-1 text-sm text-slate-600">{n.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}