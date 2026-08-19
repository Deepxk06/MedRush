import { useMemo } from "react";
import type { Emergency } from "../types";
import { EMERGENCY_STATUSES } from "../types";

const STEP_LABELS: Record<string, string> = {
  REQUESTED: "Request received",
  SEARCHING_AMBULANCE: "Searching ambulance",
  AMBULANCE_ASSIGNED: "Ambulance assigned",
  DRIVER_ACCEPTED: "Driver accepted",
  DRIVER_EN_ROUTE: "En route to pickup",
  ARRIVED_AT_PICKUP: "Arrived at pickup",
  PATIENT_PICKED_UP: "Patient picked up",
  EN_ROUTE_TO_HOSPITAL: "Heading to hospital",
  ARRIVED_AT_HOSPITAL: "Arrived at hospital",
  PATIENT_ADMITTED: "Patient admitted",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function statusLabel(status: string): string {
  return STEP_LABELS[status] ?? status;
}

export function StatusTimeline({ emergency }: { emergency: Emergency }) {
  const steps = useMemo(() => {
    if (emergency.status === "CANCELLED") {
      return ["REQUESTED", emergency.status];
    }
    const endIdx = EMERGENCY_STATUSES.indexOf(emergency.status as (typeof EMERGENCY_STATUSES)[number]);
    if (endIdx < 0) return [];
    return EMERGENCY_STATUSES.slice(0, endIdx + 1);
  }, [emergency.status]);

  const history = useMemo(() => {
    try {
      return JSON.parse(emergency.status_history || "[]") as { status: string; at: string }[];
    } catch {
      return [];
    }
  }, [emergency.status_history]);

  const timeFor = (status: string) => {
    const entry = history.find((h) => h.status === status);
    if (!entry) return null;
    const d = new Date(entry.at);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <ol className="space-y-0">
      {steps.map((step, idx) => {
        const done = idx < steps.length - 1 || emergency.status === "COMPLETED" || emergency.status === "CANCELLED";
        const current = idx === steps.length - 1 && emergency.status !== "COMPLETED" && emergency.status !== "CANCELLED";
        const time = timeFor(step);
        return (
          <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
            {idx < steps.length - 1 && (
              <span className={`absolute left-[9px] top-5 h-full w-0.5 ${done ? "bg-rose-500" : "bg-slate-200"}`} />
            )}
            <span
              className={`z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                current
                  ? "animate-pulse border-rose-600 bg-rose-600"
                  : done
                    ? "border-rose-600 bg-rose-600"
                    : "border-slate-300 bg-white"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-white" : "bg-slate-300"}`} />
            </span>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${done ? "text-slate-900" : "text-slate-400"}`}>
                {STEP_LABELS[step] ?? step}
              </p>
              {time && <p className="text-xs text-slate-400">{time}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}