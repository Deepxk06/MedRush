import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ambulance, Play, Square, TestTubes } from "lucide-react";
import { api, apiErrorMessage } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Field, Select } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/State";
import MapView, { type MapMarker } from "../../components/maps/MapView";
import type { DemoSimulations, Emergency } from "../../types";

const EMERGENCY_TYPES = [
  "Cardiac Emergency",
  "Accident / Trauma",
  "Stroke",
  "Breathing Difficulty",
  "Severe Bleeding",
  "Burns",
  "Poisoning",
  "Seizure / Convulsions",
  "Unconscious / Fainting",
  "Fever / Infection",
];

export default function AdminDemo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ patient_id: "", emergency_type: "Cardiac Emergency", severity: "HIGH" });

  const { data: patients } = useQuery({
    queryKey: ["patients-select"],
    queryFn: async () => (await api.get<{ id: number; full_name: string }[]>("/api/patients")).data,
  });

  const { data: sims, isLoading } = useQuery({
    queryKey: ["demo-sims"],
    queryFn: async () => (await api.get<DemoSimulations>("/api/admin/demo/simulations")).data,
    refetchInterval: 8000,
  });

  const { data: activeEmergency } = useQuery({
    queryKey: ["demo-active-emergency"],
    queryFn: async () => (await api.get<{ items: Emergency[] }>("/api/admin/emergencies?status=AMBULANCE_ASSIGNED&page_size=1")).data,
    enabled: !!sims?.active_emergency_id,
  });

  const simulateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/api/admin/demo/simulate-emergency", payload)).data,
    onSuccess: (data: Emergency) => {
      toast(`Emergency #${data.id} created through the real pipeline`, "SUCCESS");
      queryClient.invalidateQueries({ queryKey: ["demo-sims"] });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const startMutation = useMutation({
    mutationFn: async ({ ambulanceId, emergencyId }: { ambulanceId: number; emergencyId: number }) =>
      (await api.post(`/api/admin/demo/simulation/${ambulanceId}/start`, { emergency_id: emergencyId })).data,
    onSuccess: () => {
      toast("GPS simulation started — watch the marker move", "SUCCESS");
      queryClient.invalidateQueries({ queryKey: ["demo-sims"] });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const stopMutation = useMutation({
    mutationFn: async (ambulanceId: number) => (await api.post(`/api/admin/demo/simulation/${ambulanceId}/stop`)).data,
    onSuccess: () => {
      toast("GPS simulation stopped", "INFO");
      queryClient.invalidateQueries({ queryKey: ["demo-sims"] });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const emergencyId = sims?.active_emergency_id ?? activeEmergency?.items[0]?.id ?? null;
  const markers: MapMarker[] = (sims?.ambulances ?? []).map((a) => ({
    id: `a-${a.id}`,
    lat: a.lat ?? 13.0827,
    lng: a.lng ?? 80.2707,
    kind: "ambulance" as const,
    label: a.simulation_running ? `${a.vehicle_number} (simulating)` : a.vehicle_number,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Demo control center</h1>
          <p className="mt-1 text-sm text-slate-500">
            Trigger real emergencies and simulate ambulance GPS movement for presentations and acceptance testing.
          </p>
        </div>
        <Badge tone="amber">DEMO MODE</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="1. Create a simulated emergency" className="lg:col-span-1">
          <div className="space-y-4">
            <Field label="Patient">
              <Select value={form.patient_id} onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}>
                <option value="">First registered patient (default)</option>
                {(patients ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Emergency type">
              <Select value={form.emergency_type} onChange={(e) => setForm((f) => ({ ...f, emergency_type: e.target.value }))}>
                {EMERGENCY_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Severity">
              <Select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </Select>
            </Field>
            <Button
              className="w-full"
              loading={simulateMutation.isPending}
              icon={<TestTubes className="h-4 w-4" />}
              onClick={() =>
                simulateMutation.mutate({
                  patient_id: form.patient_id ? Number(form.patient_id) : undefined,
                  emergency_type: form.emergency_type,
                  severity: form.severity,
                })
              }
            >
              Simulate emergency
            </Button>
            <p className="text-xs text-slate-400">
              Runs priority AI → hospital recommendation → ambulance assignment → route optimization exactly like a
              real request.
            </p>
          </div>
        </Card>

        <Card title="2. Simulate ambulance GPS" className="lg:col-span-2">
          {isLoading ? (
            <Spinner label="Loading fleet…" />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {sims?.active_emergency_id
                  ? `Active emergency #${sims.active_emergency_id} (${sims.active_emergency_status}) — pick an ambulance and start its simulation.`
                  : "Create an emergency first — it becomes the simulation target."}
              </p>
              <div className="space-y-2">
                {(sims?.ambulances ?? []).map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <Ambulance className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">{a.vehicle_number}</p>
                      <p className="text-xs text-slate-500">
                        {a.status} • {a.simulation_running ? "simulating GPS" : "idle"}
                      </p>
                    </div>
                    <Badge tone={a.status === "AVAILABLE" ? "green" : a.status === "BUSY" ? "red" : "slate"}>{a.status}</Badge>
                    {a.simulation_running ? (
                      <Button variant="outline" size="sm" loading={stopMutation.isPending} onClick={() => stopMutation.mutate(a.id)} icon={<Square className="h-4 w-4" />}>
                        Stop
                      </Button>
                    ) : (
                      <Button
                        variant="success"
                        size="sm"
                        disabled={!emergencyId}
                        loading={startMutation.isPending}
                        onClick={() => startMutation.mutate({ ambulanceId: a.id, emergencyId: emergencyId! })}
                        icon={<Play className="h-4 w-4" />}
                      >
                        Simulate
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Live fleet map">
        <MapView markers={markers} center={{ lat: 13.0827, lng: 80.2707 }} zoom={12} className="h-80 rounded-xl" />
        <p className="mt-2 text-xs text-slate-400">
          Simulated ambulances move along their stored optimized routes and broadcast{" "}
          <code className="rounded bg-slate-100 px-1">ambulance_location_updated</code> events over WebSocket — the
          patient dashboard and admin live view update in real time.
        </p>
      </Card>
    </div>
  );
}