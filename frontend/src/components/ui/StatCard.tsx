import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon,
  tone = "bg-slate-50 text-slate-700",
  sub,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: string;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className={`rounded-lg p-2 ${tone}`}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}