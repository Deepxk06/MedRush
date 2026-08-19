import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useSocketRefresh } from "../../hooks/useSocketRefresh";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Spinner, Empty } from "../../components/ui/State";
import MapView from "../../components/maps/MapView";
import { StatusTimeline, statusLabel } from "../../components/StatusTimeline";
import type { Emergency } from "../../types";

export default function PatientHistory() {
  const [selected, setSelected] = useState<Emergency | null>(null);
  const socketVersion = useSocketRefresh();

  const { data, isLoading } = useQuery({
    queryKey: ["patient-emergencies", socketVersion],
    queryFn: async () => {
      const res = await api.get<Emergency[]>("/api/emergencies");
      return res.data;
    },
  });

  const list = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Emergency history</h1>
        <p className="mt-1 text-sm text-slate-500">Every request you've made, from call to completion.</p>
      </div>

      {isLoading ? (
        <Spinner label="Loading history…" />
      ) : list.length === 0 ? (
        <Empty title="No emergencies yet" desc="Your ambulance requests will appear here." />
      ) : (
        <div className="space-y-3">
          {list.map((e) => (
            <button key={e.id} onClick={() => setSelected(e)} className="block w-full text-left">
              <Card hover>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 font-extrabold text-rose-600">
                    #{e.id}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{e.emergency_type}</p>
                      <Badge tone={e.severity === "CRITICAL" ? "red" : e.severity === "HIGH" ? "amber" : "sky"}>{e.severity}</Badge>
                      <Badge tone="rose">{e.priority}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {new Date(e.created_at).toLocaleString()} • {e.hospital?.name ?? "No hospital assigned"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={e.status === "COMPLETED" ? "green" : e.status === "CANCELLED" ? "slate" : "amber"}>
                      {statusLabel(e.status)}
                    </Badge>
                    {e.ambulance && <p className="mt-1 text-xs text-slate-400">{e.ambulance.vehicle_number}</p>}
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Emergency #${selected.id} — ${selected.emergency_type}` : ""} wide>
        {selected && (
          <div className="space-y-4">
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
                <dt className="text-slate-400">Priority score</dt>
                <dd className="font-bold text-slate-900">{selected.priority_score?.toFixed(1) ?? "—"}</dd>
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
                <dt className="text-slate-400">Driver</dt>
                <dd className="font-bold text-slate-900">{selected.driver?.name ?? "—"}</dd>
              </div>
              {selected.symptoms && (
                <div className="col-span-2">
                  <dt className="text-slate-400">Symptoms</dt>
                  <dd className="font-medium text-slate-700">{selected.symptoms}</dd>
                </div>
              )}
              {selected.completed_at && (
                <div className="col-span-2">
                  <dt className="text-slate-400">Completed</dt>
                  <dd className="font-bold text-slate-900">{new Date(selected.completed_at).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}