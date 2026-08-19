import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface ToastItem {
  id: number;
  message: string;
  type: "INFO" | "SUCCESS" | "WARNING" | "DANGER" | "EMERGENCY";
}

interface ToastContextValue {
  toasts: ToastItem[];
  toast: (message: string, type?: ToastItem["type"]) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastItem["type"] = "INFO") => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const typeStyles: Record<ToastItem["type"], string> = {
  INFO: "bg-sky-600",
  SUCCESS: "bg-emerald-600",
  WARNING: "bg-amber-500",
  DANGER: "bg-rose-600",
  EMERGENCY: "bg-red-600 animate-pulse",
};

export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed right-4 top-4 z-[5000] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${typeStyles[t.type]} rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg`}
          onClick={() => dismiss(t.id)}
          role="alert"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}