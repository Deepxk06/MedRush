import type { ReactNode } from "react";

type Tone = "slate" | "red" | "green" | "amber" | "sky" | "violet" | "emerald" | "rose";

const tones: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700",
  red: "bg-red-100 text-red-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-800",
  sky: "bg-sky-100 text-sky-700",
  violet: "bg-violet-100 text-violet-700",
  emerald: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
};

export function Badge({
  children,
  tone = "slate",
  pulse = false,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${
        pulse ? "relative after:absolute after:-right-0.5 after:-top-0.5 after:h-2 after:w-2 after:animate-ping after:rounded-full after:bg-current after:opacity-60" : ""
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function severityTone(severity: string): Tone {
  switch (severity) {
    case "CRITICAL":
      return "red";
    case "HIGH":
      return "amber";
    case "MEDIUM":
      return "sky";
    default:
      return "slate";
  }
}

export function priorityTone(priority: string): Tone {
  switch (priority) {
    case "CRITICAL":
      return "red";
    case "HIGH":
      return "amber";
    case "MEDIUM":
      return "sky";
    default:
      return "green";
  }
}

export function statusTone(status: string): Tone {
  if (status === "COMPLETED") return "green";
  if (status === "CANCELLED") return "slate";
  if (status === "PATIENT_ADMITTED") return "emerald";
  if (["REQUESTED", "SEARCHING_AMBULANCE"].includes(status)) return "sky";
  if (["AMBULANCE_ASSIGNED", "DRIVER_ACCEPTED", "DRIVER_EN_ROUTE"].includes(status)) return "violet";
  if (["ARRIVED_AT_PICKUP", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL"].includes(status))
    return "amber";
  return "slate";
}

export function riskTone(risk: string): Tone {
  switch (risk) {
    case "CRITICAL":
      return "red";
    case "HIGH":
      return "amber";
    case "MEDIUM":
      return "sky";
    default:
      return "green";
  }
}