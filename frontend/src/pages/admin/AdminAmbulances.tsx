import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ambulance as AmbulanceIcon, MapPin, Plus } from "lucide-react";
import { api, apiErrorMessage } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Field, Input, Select } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { Spinner, Empty } from "../../components/ui/State";
import MapView, { type MapMarker } from "../../components/maps/MapView";
import type { AmbulanceAdmin } from "../../types";

const STATUS_TONE: Record<string, "green" | "red" | "amber" | "slate"> = {
  AVAILABLE: "green",
  BUSY: "red",
  MAINTENANCE: "amber",
  OFFLINE: "slate",
};

export default function AdminAmbulances() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: ambulances, isLoading } = useQuery({
    queryKey: ["admin-ambulances"],
    queryFn: async () => (await api.get<AmbulanceAdmin[]>("/api/ambulances")).data,
    refetchInterval: 15000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/api/ambulances", payload)).data,
    onSuccess: () => {
      toast("Ambulance created", "SUCCESS");
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-ambulances"] });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      (await api.put(`/api/ambulances/${id}`, { status })).data,
    onSuccess: () => {
      toast("Ambulance status updated", "SUCCESS");
      queryClient.invalidateQueries({ queryKey: ["admin-ambulances"] });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const list = ambulances ?? [];
  const markers: MapMarker[] = list
    .filter((a) => a.current_lat != null && a.current_lng != null)
    .map((a) => ({
      id: `amb-${a.id}`,
      lat: a.current_lat!,
      lng: a.current_lng!,
      kind: "ambulance" as const,
      label: a.vehicle_number,
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Ambulances</h1>
          <p className="mt-1 text-sm text-slate-500">Fleet status and live positions.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
          Add ambulance
        </Button>
      </div>

      <Card>
        <MapView markers={markers} center={{ lat: 13.0827, lng: 80.2707 }} zoom={11} className="h-72 rounded-xl" />
      </Card>

      {isLoading ? (
        <Spinner label="Loading fleet…" />
      ) : list.length === 0 ? (
        <Card>
          <Empty title="No ambulances" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <Card key={a.id} hover>
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                  <AmbulanceIcon className="h-6 w-6" />
                </span>
                <Badge tone={STATUS_TONE[a.status] ?? "slate"}>{a.status}</Badge>
              </div>
              <p className="mt-3 font-extrabold text-slate-900">{a.vehicle_number}</p>
              <p className="text-xs text-slate-500">
                {a.type} • capacity {a.capacity} • driver: {a.driver_name ?? "none"}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="h-3 w-3" />
                {a.current_lat != null ? `${a.current_lat.toFixed(4)}, ${a.current_lng?.toFixed(4)}` : "No live position"}
              </p>
              <div className="mt-4">
                <Select value={a.status} onChange={(e) => statusMutation.mutate({ id: a.id, status: e.target.value })}>
                  <option value="AVAILABLE">AVAILABLE</option>
                  <option value="BUSY">BUSY</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="OFFLINE">OFFLINE</option>
                </Select>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add ambulance">
        <AmbulanceForm loading={createMutation.isPending} onSubmit={(p) => createMutation.mutate(p)} />
      </Modal>
    </div>
  );
}

function AmbulanceForm({ loading, onSubmit }: { loading: boolean; onSubmit: (p: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({ vehicle_number: "", type: "ADVANCED", capacity: "1", status: "AVAILABLE" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...form, capacity: Number(form.capacity) });
      }}
      className="space-y-4"
    >
      <Field label="Vehicle number">
        <Input required value={form.vehicle_number} onChange={set("vehicle_number")} placeholder="TN 01 AB 1234" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <Select value={form.type} onChange={set("type")}>
            <option value="BASIC">BASIC</option>
            <option value="ADVANCED">ADVANCED</option>
            <option value="ICU">ICU</option>
          </Select>
        </Field>
        <Field label="Capacity">
          <Input type="number" min={1} max={10} value={form.capacity} onChange={set("capacity")} />
        </Field>
      </div>
      <Field label="Status">
        <Select value={form.status} onChange={set("status")}>
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="BUSY">BUSY</option>
          <option value="MAINTENANCE">MAINTENANCE</option>
          <option value="OFFLINE">OFFLINE</option>
        </Select>
      </Field>
      <Button type="submit" loading={loading} className="w-full">
        Create ambulance
      </Button>
    </form>
  );
}