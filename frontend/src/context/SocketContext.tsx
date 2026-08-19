import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tokenStore } from "../api/client";
import { useAuth } from "./AuthContext";
import { useToast, type ToastItem } from "./ToastContext";

type SocketHandler = (data: unknown) => void;

interface SocketContextValue {
  connected: boolean;
  on: (event: string, handler: SocketHandler) => () => void;
  lastEvent: { event: string; data: unknown } | null;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const WS_URL = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws";

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ event: string; data: unknown } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<SocketHandler>>>(new Map());
  const reconnectTimer = useRef<number | null>(null);

  const on = useCallback((event: string, handler: SocketHandler) => {
    const set = handlersRef.current.get(event) ?? new Set();
    set.add(handler);
    handlersRef.current.set(event, set);
    return () => {
      set.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const token = tokenStore.access;
    if (!token) return;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data as string) as { event: string; data: unknown };
          setLastEvent(payload);
          const handlers = handlersRef.current.get(payload.event);
          if (handlers) {
            handlers.forEach((fn) => fn(payload.data));
          }
          if (payload.event === "notification_created") {
            const n = payload.data as { title?: string; message?: string; type?: string };
            toast(n.message || n.title || "New notification", (n.type as ToastItem["type"]) || "INFO");
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
          if (
            ["emergency_created", "ambulance_assigned", "status_updated", "route_optimized", "driver_rejected"].includes(
              payload.event,
            )
          ) {
            queryClient.invalidateQueries({ queryKey: ["emergencies"] });
            queryClient.invalidateQueries({ queryKey: ["active-emergency"] });
            queryClient.invalidateQueries({ queryKey: ["overview"] });
            queryClient.invalidateQueries({ queryKey: ["ambulances"] });
            queryClient.invalidateQueries({ queryKey: ["incoming"] });
          }
          if (payload.event === "hospital_resource_updated") {
            queryClient.invalidateQueries({ queryKey: ["resources"] });
            queryClient.invalidateQueries({ queryKey: ["overview"] });
            queryClient.invalidateQueries({ queryKey: ["hospitals"] });
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!disposed) {
          reconnectTimer.current = window.setTimeout(connect, 2500);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [user, queryClient, toast]);

  return (
    <SocketContext.Provider value={{ connected, on, lastEvent }}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}