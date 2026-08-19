import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, Ambulance, ArrowRight, BedDouble, Gauge, HeartPulse, Stethoscope } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import { useSocketRefresh } from "../../hooks/useSocketRefresh";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { StatCard } from "../../components/ui/StatCard";
import { Spinner, Empty } from "../../components/ui/State";
import MapView from "../../components/maps/MapView";
import { StatusTimeline, statusLabel } from "../../components/StatusTimeline";
import type { Emergency, HospitalResource } from "../../types";

export default function HospitalDashboard() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Emergency | null>(null);
  const socketVersion = useSocketRefresh();
  const { connected } = useSocket();

  const hospitalId = user?.hospital_id;

  const { data: resources } = useQuery({
    queryKey: ["hospital-resources", hospitalId],
    queryFn: async () => (await api.get<HospitalResource>(`/api/hospitals/${hospitalId}/resources`)).data,
    enabled: !!hospitalId,
    refetchInterval: 30000,
  });

  const { data: incomingData, isLoading } = useQuery({
    queryKey: ["incoming", hospitalId, socketVersion],
    queryFn: async () => (await api.get<{ items: Emergency[] }>(`/api/hospitals/${hospitalId}/incoming`)).data,
    enabled: !!hospitalId,
  });

  const incoming = incomingData?.items ?? [];
  const critical = incoming.filter((e) => e.severity === "CRITICAL").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{user?.hospital_name ?? "Hospital"}</h1>
          <p className="mt-1 text-sm text-slate-500">Live resource availability and incoming emergencies.</p>
        </div>
        <Badge tone={connected ? "green" : "amber"} pulse={connected}>
          {connected ? "Live updates" : "Reconnecting"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Beds available"
          value={`${resources?.available_beds ?? "—"} / ${resources?.total_beds ?? "—"}`}
          icon={<BedDouble className="h-5 w-5" />}
          tone={(resources?.bed_usage_pct ?? 0) > 85 ? "rose" : "sky"}
        />
        <StatCard
          label="ICU available"
          value={`${resources?.available_icu ?? "—"} / ${resources?.total_icu ?? "—"}`}
          icon={<Activity className="h-5 w-5" />}
          tone={(resources?.icu_usage_pct ?? 0) > 85 ? "rose" : "sky"}
        />
        <StatCard
          label="Ventilators"
          value={`${resources?.available_ventilators ?? "—"} / ${resources?.total_ventilators ?? "—"}`}
          icon={<Gauge className="h-5 w-5" />}
          tone={(resources?.ventilator_usage_pct ?? 0) > 85 ? "rose" : "sky"}
        />
        <StatCard
          label="Incoming emergencies"
          value={incoming.length}
          icon={<Ambulance className="h-5 w-5" />}
          tone={critical > 0 ? "rose" : "green"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={`Incoming emergencies (${incoming.length})`}>
          {isLoading ? (
            <Spinner label="Loading incoming…" />
          ) : incoming.length === 0 ? (
            <Empty title="No incoming emergencies" desc="Ambulances assigned to your hospital will appear here in real time." />
          ) : (
            <div className="space-y-3">
              {incoming.map((e) => (
                <button key={e.id} onClick={() => setSelected(e)} className="block w-full text-left">
                  <Card hover>
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          e.severity === "CRITICAL" ? "bg-red-100 text-red-600" : e.severity === "HIGH" ? "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600"
                        }`}
                      >
                        <HeartPulse className="h-6 w-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-900">#{e.id} {e.emergency_type}</p>
                          <Badge tone={e.severity === "CRITICAL" ? "red" : e.severity === "HIGH" ? "amber" : "sky"}>{e.severity}</Badge>
                          <Badge tone="rose">{e.priority}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {e.patient_name ?? `Patient #${e.patient_id}`} • {e.ambulance?.vehicle_number ?? "ambulance"} • {statusLabel(e.status)}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-400">
                        {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Bed utilization">
            <div className="space-y-4">
              <UsageBar label="General beds" pct={resources?.bed_usage_pct ?? 0} />
              <UsageBar label="ICU" pct={resources?.icu_usage_pct ?? 0} />
              <UsageBar label="Ventilators" pct={resources?.ventilator_usage_pct ?? 0} />
            </div>
            <Link to="/app/resources" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-rose-600 hover:underline">
              Manage resources <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
          <Card title="Staff">
            <p className="text-sm text-slate-600">
              <span className="font-bold text-slate-900">{resources?.available_doctors ?? "—"}</span> of{" "}
              {resources?.total_doctors ?? "—"} doctors available
            </p>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-bold text-slate-900">{resources?.available_nurses ?? "—"}</span> of{" "}
              {resources?.total_nurses ?? "—"} nurses available
            </p>
            <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <Stethoscope className="h-4 w-4" />
              AI forecasts your demand on the Predictions page.
            </p>
          </Card>
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Incoming emergency #${selected.id}` : ""} wide>
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={selected.severity === "CRITICAL" ? "red" : selected.severity === "HIGH" ? "amber" : "sky"}>{selected.severity}</Badge>
              <Badge tone="rose">{selected.priority}</Badge>
              <Badge tone="slate">{statusLabel(selected.status)}</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <MapView
                markers={[
                  { id: "pickup", lat: selected.pickup_lat, lng: selected.pickup_lng, kind: "pickup", label: "Pickup" },
                  ...(selected.hospital?.lat != null
                    ? [{ id: "hospital", lat: selected.hospital.lat, lng: selected.hospital.lng, kind: "hospital" as const, label: selected.hospital.name }]
                    : []),
                ]}
                className="h-64 rounded-xl"
              />
              <StatusTimeline emergency={selected} />
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-slate-400">Patient</dt>
                <dd className="font-bold text-slate-900">{selected.patient_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Age / Gender</dt>
                <dd className="font-bold text-slate-900">{selected.patient_age ?? "—"} / {selected.patient_gender ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Blood group</dt>
                <dd className="font-bold text-slate-900">{selected.blood_group ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Allergies</dt>
                <dd className="font-bold text-slate-900">{selected.allergies ?? "None"}</dd>
              </div>
              {selected.symptoms && (
                <div className="col-span-2">
                  <dt className="text-slate-400">Symptoms</dt>
                  <dd className="font-medium text-slate-700">{selected.symptoms}</dd>
                </div>
              )}
              {selected.medical_history && (
                <div className="col-span-2">
                  <dt className="text-slate-400">Medical history</dt>
                  <dd className="font-medium text-slate-700">{selected.medical_history}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}

function UsageBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className={`font-bold ${pct > 85 ? "text-rose-600" : "text-slate-500"}`}>{pct}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-slate-100">
        <div
          className={`h-2.5 rounded-full ${pct > 85 ? "bg-rose-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}