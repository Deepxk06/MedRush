import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BedDouble, Gauge, Wind } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Spinner } from "../../components/ui/State";
import type { ResourcePrediction } from "../../types";

const RESOURCE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  beds: { label: "General beds", icon: <BedDouble className="h-5 w-5" />, color: "#0ea5e9" },
  icu: { label: "ICU", icon: <Activity className="h-5 w-5" />, color: "#f59e0b" },
  emergency_beds: { label: "Emergency beds", icon: <Gauge className="h-5 w-5" />, color: "#8b5cf6" },
  ventilators: { label: "Ventilators", icon: <Wind className="h-5 w-5" />, color: "#10b981" },
  doctors: { label: "Doctors", icon: <Activity className="h-5 w-5" />, color: "#e11d48" },
};

export default function HospitalPredictions() {
  const { user } = useAuth();
  const hospitalId = user?.hospital_id;

  const { data: predictions, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["predictions", hospitalId],
    queryFn: async () =>
      (await api.get<ResourcePrediction[]>(`/api/ai/resource-prediction/all?hospital_id=${hospitalId}&horizon_hours=6`)).data,
    enabled: !!hospitalId,
    refetchInterval: 60_000,
  });

  const list = predictions ?? [];
  const highRisk = list.filter((p) => p.risk_level === "HIGH").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">AI resource predictions</h1>
          <p className="mt-1 text-sm text-slate-500">
            6-hour demand forecast for {user?.hospital_name ?? "your hospital"} using gradient-boosting models trained on 14 days of history.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isRefetching ? "Predicting…" : "Run forecast"}
        </button>
      </div>

      {isLoading ? (
        <Spinner label="Running AI prediction…" />
      ) : list.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-slate-400">No predictions yet. Run a forecast to see demand projections.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {list.map((p) => {
              const meta = RESOURCE_META[p.resource] ?? { label: p.resource, icon: null, color: "#64748b" };
              return (
                <Card key={p.resource}>
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg p-2" style={{ background: `${meta.color}20`, color: meta.color }}>
                      {meta.icon}
                    </span>
                    <Badge tone={p.risk_level === "HIGH" ? "red" : p.risk_level === "MEDIUM" ? "amber" : "green"}>{p.risk_level} risk</Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-600">{meta.label}</p>
                  <p className="text-xl font-extrabold text-slate-900">
                    {p.expected_shortage > 0 ? `-${p.expected_shortage}` : "0"}
                    <span className="text-xs font-semibold text-slate-400"> expected shortage</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {p.current_available} of {p.current_total} available now
                  </p>
                  <p className="mt-1 text-xs font-semibold" style={{ color: meta.color }}>
                    → {p.predicted_usage.toFixed(0)} units in {p.horizon_hours}h
                  </p>
                  <p className="mt-2 text-[11px] text-slate-400">Confidence {(p.confidence * 100).toFixed(0)}%</p>
                </Card>
              );
            })}
          </div>

          {highRisk > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span className="font-bold">Attention:</span> {highRisk} resource{highRisk > 1 ? "s" : ""} face high shortage risk in the next 6 hours.
              Consider arranging additional capacity.
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((p) => (
              <PredictionChart key={p.resource} prediction={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PredictionChart({ prediction }: { prediction: ResourcePrediction }) {
  const meta = RESOURCE_META[prediction.resource] ?? { label: prediction.resource, icon: null, color: "#64748b" };
  const data = useMemo(
    () =>
      (prediction.series ?? []).map((s) => ({
        hour: `${s.hour_offset}h`,
        predicted: Math.round(s.predicted_usage),
        available: Math.round(prediction.current_available),
      })),
    [prediction],
  );

  return (
    <Card title={`${meta.label} — demand forecast`}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="predicted" name="Predicted usage" stroke={meta.color} strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="available" name="Available now" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-slate-500">{prediction.explanation}</p>
    </Card>
  );
}