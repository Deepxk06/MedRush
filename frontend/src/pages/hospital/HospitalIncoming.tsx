import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ambulance, HeartPulse } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useSocketRefresh } from "../../hooks/useSocketRefresh";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Spinner, Empty } from "../../components/ui/State";
import MapView from "../../components/maps/MapView";
import { StatusTimeline, statusLabel } from "../../components/StatusTimeline";
import type { Emergency } from "../../types";

export default function HospitalIncoming() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Emergency | null>(null);
  const socketVersion = useSocketRefresh();
  const hospitalId = user?.hospital_id;

  const { data, isLoading } = useQuery({
    queryKey: ["incoming", hospitalId, socketVersion],
    queryFn: async () => (await api.get<{ items: Emergency[] }>(`/api/hospitals/${hospitalId}/incoming`)).data,
    enabled: !!hospitalId,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Incoming emergencies</h1>
        <p className="mt-1 text-sm text-slate-500">Patients routed to {user?.hospital_name ?? "your hospital"}.</p>
      </div>

      {isLoading ? (
        <Spinner label="Loading incoming…" />
      ) : items.length === 0 ? (
        <Card>
          <Empty
            title="No incoming emergencies"
            desc="When the AI routes an ambulance to your hospital, the full patient context appears here live."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((e) => (
            <button key={e.id} onClick={() => setSelected(e)} className="block w-full text-left">
              <Card hover>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                    <HeartPulse className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">#{e.id} {e.emergency_type}</p>
                      <Badge tone={e.severity === "CRITICAL" ? "red" : e.severity === "HIGH" ? "amber" : "sky"}>{e.severity}</Badge>
                      <Badge tone="rose">{e.priority}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {e.patient_name ?? `Patient #${e.patient_id}`} • {e.patient_age ?? "?"}y • {e.blood_group ?? "no blood group"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={e.status === "ARRIVED_AT_HOSPITAL" ? "green" : e.status === "PATIENT_ADMITTED" ? "green" : "amber"}>
                      {statusLabel(e.status)}
                    </Badge>
                    {e.ambulance && (
                      <p className="mt-1 flex items-center justify-end gap-1 text-xs text-slate-400">
                        <Ambulance className="h-3 w-3" /> {e.ambulance.vehicle_number}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Emergency #${selected.id}` : ""} wide>
        {selected && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <MapView
                markers={[
                  { id: "pickup", lat: selected.pickup_lat, lng: selected.pickup_lng, kind: "pickup", label: "Pickup" },
                  ...(selected.hospital?.lat != null
                    ? [{ id: "hospital", lat: selected.hospital.lat, lng: selected.hospital.lng, kind: "hospital" as const, label: selected.hospital.name }]
                    : []),
                  ...(selected.ambulance?.current_lat != null && selected.ambulance.current_lng != null
                    ? [{ id: "ambulance", lat: selected.ambulance.current_lat, lng: selected.ambulance.current_lng, kind: "ambulance" as const, label: selected.ambulance.vehicle_number }]
                    : []),
                ]}
                paths={
                  selected.route?.legs
                    ? Object.values(selected.route.legs)
                        .filter((l): l is NonNullable<typeof l> => !!l)
                        .map((l) => ({ latlngs: l.path, color: "#e11d48" }))
                    : []
                }
                className="h-72 rounded-xl"
              />
              <StatusTimeline emergency={selected} />
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-slate-400">Patient</dt>
                <dd className="font-bold text-slate-900">{selected.patient_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Contact</dt>
                <dd className="font-bold text-slate-900">{selected.contact_phone ?? "—"}</dd>
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