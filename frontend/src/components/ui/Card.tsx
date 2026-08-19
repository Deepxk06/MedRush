import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  title,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${
        hover ? "transition hover:border-rose-300 hover:shadow-md" : ""
      } ${className}`}
    >
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}