import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ambulance, ArrowRight, Clock, MapPin } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useSocketRefresh } from "../../hooks/useSocketRefresh";
import { StatCard } from "../../components/ui/StatCard";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Spinner, Empty } from "../../components/ui/State";
import MapView, { type MapMarker } from "../../components/maps/MapView";
import { StatusTimeline, statusLabel } from "../../components/StatusTimeline";
import { Button } from "../../components/ui/Button";
import type { Emergency, PatientProfile } from "../../types";

const ACTIVE_STATUSES = new Set([
  "REQUESTED",
  "SEARCHING_AMBULANCE",
  "AMBULANCE_ASSIGNED",
  "DRIVER_ACCEPTED",
  "DRIVER_EN_ROUTE",
  "ARRIVED_AT_PICKUP",
  "PATIENT_PICKED_UP",
  "EN_ROUTE_TO_HOSPITAL",
  "ARRIVED_AT_HOSPITAL",
]);

export default function PatientDashboard() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Emergency | null>(null);
  const socketVersion = useSocketRefresh();

  const { data: profile } = useQuery({
    queryKey: ["patient-profile"],
    queryFn: async () => (await api.get<PatientProfile>("/api/patients/me")).data,
  });

  const { data: emergencies, isLoading } = useQuery({
    queryKey: ["patient-emergencies", socketVersion],
    queryFn: async () => {
      const res = await api.get<Emergency[]>("/api/emergencies");
      return res.data;
    },
  });

  const list = useMemo(() => emergencies ?? [], [emergencies]);
  const active = list.find((e) => ACTIVE_STATUSES.has(e.status));
  const completed = useMemo(() => list.filter((e) => !ACTIVE_STATUSES.has(e.status)), [list]);
  const recent = [...completed].slice(0, 5);

  const mapMarkers: MapMarker[] = useMemo(() => {
    if (!active) return [];
    const ms: MapMarker[] = [{ id: "pickup", lat: active.pickup_lat, lng: active.pickup_lng, kind: "pickup", label: "Pickup" }];
    if (active.hospital?.lat != null) {
      ms.push({ id: "hospital", lat: active.hospital.lat, lng: active.hospital.lng, kind: "hospital", label: active.hospital.name });
    }
    if (active.ambulance?.current_lat != null && active.ambulance.current_lng != null) {
      ms.push({ id: "ambulance", lat: active.ambulance.current_lat, lng: active.ambulance.current_lng, kind: "ambulance", label: active.ambulance.vehicle_number });
    }
    return ms;
  }, [active]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Welcome, {user?.full_name?.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {profile?.blood_group ? `Blood group ${profile.blood_group} • ` : ""}
          {profile?.medical_history ? profile.medical_history : "No medical history recorded"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total emergencies" value={list.length} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Completed trips" value={completed.length} icon={<Ambulance className="h-5 w-5" />} />
        <StatCard
          label="Active emergency"
          value={active ? statusLabel(active.status) : "None"}
          tone={active ? "rose" : "green"}
          icon={<MapPin className="h-5 w-5" />}
        />
      </div>

      {active && (
        <Card className="border-rose-200 ring-1 ring-rose-100">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Active emergency</h2>
              <p className="text-sm text-slate-500">
                {active.emergency_type} • {active.severity} • {statusLabel(active.status)}
              </p>
            </div>
            <Badge tone="rose" pulse>
              LIVE
            </Badge>
          </div>
          <div className="grid gap-4 py-4 md:grid-cols-2">
            <MapView markers={mapMarkers} paths={active.route?.legs ? Object.values(active.route.legs).filter((l): l is NonNullable<typeof l> => !!l).map((l) => ({ latlngs: l.path, color: "#e11d48" })) : []} className="h-72 rounded-xl" />
            <StatusTimeline emergency={active} />
          </div>
          {active.ambulance && (
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span className="font-bold text-slate-800">{active.ambulance.vehicle_number}</span> assigned • driver{" "}
              <span className="font-bold">{active.driver?.name ?? "assigned"}</span> • hospital{" "}
              <span className="font-bold">{active.hospital?.name ?? "being chosen"}</span>
            </div>
          )}
        </Card>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">Recent emergencies</h2>
          <Link to="/app/history" className="inline-flex items-center gap-1 text-sm font-bold text-rose-600 hover:underline">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {isLoading ? (
          <Spinner label="Loading emergencies…" />
        ) : recent.length === 0 ? (
          <Empty
            title="No emergencies yet"
            action={
              <Link to="/app/request">
                <Button>Request an ambulance</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((e) => (
              <button key={e.id} onClick={() => setSelected(e)} className="text-left">
                <Card hover>
                  <div className="flex items-center justify-between">
                    <Badge tone={e.severity === "CRITICAL" ? "red" : e.severity === "HIGH" ? "amber" : "sky"}>
                      {e.severity}
                    </Badge>
                    <Badge tone="slate">{e.status}</Badge>
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-900">{e.emergency_type}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(e.created_at).toLocaleString()} • {e.hospital?.name ?? "No hospital"}
                  </p>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Emergency #${selected.id}` : ""} wide>
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={selected.severity === "CRITICAL" ? "red" : selected.severity === "HIGH" ? "amber" : "sky"}>
                {selected.severity}
              </Badge>
              <Badge tone="rose">{selected.priority}</Badge>
              <Badge tone="slate">{selected.status}</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <MapView
                markers={[
                  { id: "pickup", lat: selected.pickup_lat, lng: selected.pickup_lng, kind: "pickup", label: "Pickup" },
                ]}
                className="h-56 rounded-xl"
              />
              <StatusTimeline emergency={selected} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-400">Type</dt>
                <dd className="font-bold text-slate-900">{selected.emergency_type}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Hospital</dt>
                <dd className="font-bold text-slate-900">{selected.hospital?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Ambulance</dt>
                <dd className="font-bold text-slate-900">{selected.ambulance?.vehicle_number ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Priority score</dt>
                <dd className="font-bold text-slate-900">{selected.priority_score?.toFixed(1) ?? "—"}</dd>
              </div>
              {selected.pickup_address && (
                <div className="col-span-2">
                  <dt className="text-slate-400">Pickup address</dt>
                  <dd className="font-bold text-slate-900">{selected.pickup_address}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}