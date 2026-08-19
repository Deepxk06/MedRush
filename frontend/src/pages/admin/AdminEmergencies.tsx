import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartPulse, Search } from "lucide-react";
import { api } from "../../api/client";
import { useSocketRefresh } from "../../hooks/useSocketRefresh";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Field";
import { Spinner, Empty } from "../../components/ui/State";
import MapView from "../../components/maps/MapView";
import { StatusTimeline, statusLabel } from "../../components/StatusTimeline";
import type { Emergency } from "../../types";

const STATUS_FILTERS = [
  "ALL",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "PATIENT_ADMITTED",
  "ARRIVED_AT_HOSPITAL",
  "EN_ROUTE_TO_HOSPITAL",
  "AMBULANCE_ASSIGNED",
];

const ACTIVE = new Set([
  "REQUESTED", "SEARCHING_AMBULANCE", "AMBULANCE_ASSIGNED", "DRIVER_ACCEPTED", "DRIVER_EN_ROUTE",
  "ARRIVED_AT_PICKUP", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL", "PATIENT_ADMITTED",
]);

export default function AdminEmergencies() {
  const socketVersion = useSocketRefresh();
  const [selected, setSelected] = useState<Emergency | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-emergencies", filter, search, socketVersion],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "50" });
      if (filter !== "ALL") params.set("status", filter);
      if (search) params.set("search", search);
      return (await api.get<{ total: number; items: Emergency[] }>(`/api/admin/emergencies?${params}`)).data;
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">All emergencies</h1>
        <p className="mt-1 text-sm text-slate-500">{data?.total ?? 0} total requests across the network.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
              filter === s ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patient, type, address…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <Spinner label="Loading emergencies…" />
      ) : items.length === 0 ? (
        <Card>
          <Empty title="No emergencies match" desc="Adjust the filters or search to see more." />
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
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {e.patient_name ?? `Patient #${e.patient_id}`} • {e.hospital?.name ?? "no hospital"} •{" "}
                      {e.ambulance?.vehicle_number ?? "no ambulance"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={e.status === "COMPLETED" ? "green" : e.status === "CANCELLED" ? "slate" : ACTIVE.has(e.status) ? "amber" : "slate"}>
                      {statusLabel(e.status)}
                    </Badge>
                    <p className="mt-1 text-xs text-slate-400">{new Date(e.created_at).toLocaleString()}</p>
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
            {selected.hospital_reason && (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{selected.hospital_reason}</p>
            )}
            {selected.priority_reason && (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{selected.priority_reason}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}