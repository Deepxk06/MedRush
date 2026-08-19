import type { ReactNode } from "react";

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: ReactNode }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
            active === tab.key ? "bg-white text-rose-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}