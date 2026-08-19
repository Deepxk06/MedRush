import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, Plus, Stethoscope } from "lucide-react";
import { api, apiErrorMessage } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Field, Input, Select } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { Spinner, Empty } from "../../components/ui/State";
import MapView, { type MapMarker } from "../../components/maps/MapView";
import type { Hospital } from "../../types";

export default function AdminHospitals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: hospitals, isLoading } = useQuery({
    queryKey: ["hospitals"],
    queryFn: async () => (await api.get<Hospital[]>("/api/hospitals")).data,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/api/hospitals", payload)).data,
    onSuccess: () => {
      toast("Hospital created", "SUCCESS");
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["hospitals"] });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const list = hospitals ?? [];
  const markers: MapMarker[] = list.map((h) => ({
    id: `h-${h.id}`,
    lat: h.lat,
    lng: h.lng,
    kind: "hospital" as const,
    label: h.name,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Hospitals</h1>
          <p className="mt-1 text-sm text-slate-500">Facilities in the MedRush AI network.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
          Add hospital
        </Button>
      </div>

      <Card>
        <MapView markers={markers} center={{ lat: 13.0827, lng: 80.2707 }} zoom={11} className="h-72 rounded-xl" />
      </Card>

      {isLoading ? (
        <Spinner label="Loading hospitals…" />
      ) : list.length === 0 ? (
        <Card>
          <Empty title="No hospitals" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((h) => (
            <Card key={h.id}>
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                  <Building2 className="h-6 w-6" />
                </span>
                <Badge tone={h.is_active ? "green" : "slate"}>{h.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-3 font-extrabold text-slate-900">{h.name}</p>
              <p className="text-xs text-slate-500">
                {h.level} {h.specialties ? `• ${h.specialties}` : ""}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="h-3 w-3" /> {h.lat.toFixed(4)}, {h.lng.toFixed(4)}
              </p>
              {h.address && <p className="mt-1 text-xs text-slate-400">{h.address}</p>}
            </Card>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add hospital">
        <HospitalForm loading={createMutation.isPending} onSubmit={(p) => createMutation.mutate(p)} />
      </Modal>
    </div>
  );
}

function HospitalForm({ loading, onSubmit }: { loading: boolean; onSubmit: (p: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    lat: "13.0827",
    lng: "80.2707",
    level: "GENERAL",
    specialties: "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...form, lat: Number(form.lat), lng: Number(form.lng) });
      }}
      className="space-y-4"
    >
      <Field label="Name">
        <Input required value={form.name} onChange={set("name")} />
      </Field>
      <Field label="Address">
        <Input value={form.address} onChange={set("address")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone">
          <Input value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set("email")} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Latitude">
          <Input type="number" step="any" value={form.lat} onChange={set("lat")} />
        </Field>
        <Field label="Longitude">
          <Input type="number" step="any" value={form.lng} onChange={set("lng")} />
        </Field>
        <Field label="Level">
          <Select value={form.level} onChange={set("level")}>
            <option value="GENERAL">GENERAL</option>
            <option value="TRAUMA">TRAUMA</option>
            <option value="SPECIALTY">SPECIALTY</option>
          </Select>
        </Field>
      </div>
      <Field label="Specialties">
        <Input value={form.specialties} onChange={set("specialties")} placeholder="e.g. Cardiology, Neurology" />
      </Field>
      <p className="flex items-center gap-2 text-xs text-slate-400">
        <Stethoscope className="h-4 w-4" />
        Resource availability is configured from the hospital's staff dashboard after creation.
      </p>
      <Button type="submit" loading={loading} className="w-full">
        Create hospital
      </Button>
    </form>
  );
}