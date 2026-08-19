import { useQuery } from "@tanstack/react-query";
import { Brain, Cpu, Database, RefreshCw } from "lucide-react";
import { api } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Spinner } from "../../components/ui/State";
import type { ModelInfo } from "../../types";

const MODEL_META: Record<string, { label: string; icon: React.ReactNode; desc: string }> = {
  resource_prediction: {
    label: "Resource prediction",
    icon: <Database className="h-6 w-6" />,
    desc: "Gradient-boosting regressors forecasting bed, ICU, emergency bed, ventilator and doctor demand per hospital from temporal and operational features.",
  },
  emergency_priority: {
    label: "Emergency priority",
    icon: <Brain className="h-6 w-6" />,
    desc: "Random-forest classifier (with rule-based hybrid fallback) that scores emergency severity for dispatch urgency.",
  },
};

export default function AdminAi() {
  const { data: models, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["ai-models"],
    queryFn: async () => (await api.get<ModelInfo[]>("/api/ai/models")).data,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">AI models</h1>
          <p className="mt-1 text-sm text-slate-500">
            Production ML artifacts serving the MedRush AI pipeline. Models are loaded lazily and are read-only at
            runtime.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} /> Refresh status
        </button>
      </div>

      {isLoading ? (
        <Spinner label="Loading model info…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(models ?? []).map((m) => {
            const meta = MODEL_META[m.name] ?? { label: m.name, icon: <Cpu className="h-6 w-6" />, desc: "" };
            return (
              <Card key={m.name}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                    {meta.icon}
                  </span>
                  <Badge tone={m.trained ? "green" : "amber"}>{m.trained ? "Trained" : "Not trained"}</Badge>
                </div>
                <h2 className="mt-4 text-lg font-extrabold text-slate-900">{meta.label}</h2>
                <p className="mt-1 text-sm text-slate-500">{meta.desc}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
                  <div>
                    <dt className="text-slate-400">Algorithm</dt>
                    <dd className="font-bold text-slate-900">{m.algorithm}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Version</dt>
                    <dd className="font-bold text-slate-900">{m.version ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Dataset rows</dt>
                    <dd className="font-bold text-slate-900">{m.dataset_rows?.toLocaleString() ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Features</dt>
                    <dd className="font-bold text-slate-900">
                      {m.name === "resource_prediction" ? "18" : "13"}
                    </dd>
                  </div>
                </dl>
                {m.metrics && Object.keys(m.metrics).length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Evaluation metrics</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Object.entries(m.metrics).map(([k, v]) => (
                        <div key={k} className="rounded-lg border border-slate-200 p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{k}</p>
                          {typeof v === "object" && v !== null ? (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {Object.entries(v).map(([mk, mv]) => (
                                <span key={mk} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                                  {mk}: {typeof mv === "number" ? (Math.abs(mv) > 100 ? mv.toFixed(0) : mv.toFixed(3)) : String(mv)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-sm font-bold text-slate-900">
                              {typeof v === "number" ? (Math.abs(v) > 100 ? v.toFixed(0) : v.toFixed(3)) : String(v)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Decisions are decision-support only — medical judgment always remains with qualified professionals.
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}