import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ambulance, CheckCircle2, MapPin, Navigation, Stethoscope } from "lucide-react";
import { api, apiErrorMessage } from "../../api/client";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useToast } from "../../context/ToastContext";
import { useSocket } from "../../context/SocketContext";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { Spinner } from "../../components/ui/State";
import MapView, { type MapMarker, type MapPath } from "../../components/maps/MapView";
import { statusLabel } from "../../components/StatusTimeline";
import type { Emergency, EmergencyCreatePayload, Hospital, PatientProfile } from "../../types";

const EMERGENCY_TYPES = [
  "Cardiac Emergency",
  "Accident / Trauma",
  "Stroke",
  "Breathing Difficulty",
  "Severe Bleeding",
  "Burns",
  "Poisoning",
  "Pregnancy / Childbirth",
  "Seizure / Convulsions",
  "Unconscious / Fainting",
  "Fever / Infection",
  "Other",
];

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

export default function RequestAmbulance() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { position, error: geoError, loading: geoLoading, locate } = useGeolocation();

  useEffect(() => {
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState({
    emergency_type: EMERGENCY_TYPES[0],
    severity: "MEDIUM",
    symptoms: "",
    pickup_address: "",
    preferred_hospital_hint: "",
    heart_rate: "",
    blood_pressure: "",
    spo2: "",
    respiratory_rate: "",
  });
  const [created, setCreated] = useState<Emergency | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socketVersion, setSocketVersion] = useState(0);

  const { data: hospitals } = useQuery({
    queryKey: ["hospitals"],
    queryFn: async () => (await api.get<Hospital[]>("/api/hospitals")).data,
    staleTime: 60_000,
  });

  const { data: profile } = useQuery({
    queryKey: ["patient-profile"],
    queryFn: async () => (await api.get<PatientProfile>("/api/patients/me")).data,
    staleTime: 60_000,
  });

  const { on, connected } = useSocket();
  useEffect(() => {
    if (!connected || !created) return;
    const unsubStatus = on("status_updated", (data) => {
      const msg = data as { emergency?: Emergency };
      if (msg.emergency?.id === created.id) setCreated(msg.emergency);
    });
    const unsubLoc = on("ambulance_location_updated", (data) => {
      const msg = data as { emergency_id?: number };
      if (msg.emergency_id === created.id) setSocketVersion((v) => v + 1);
    });
    return () => {
      unsubStatus();
      unsubLoc();
    };
  }, [on, connected, created]);

  const { data: liveEmergency } = useQuery({
    queryKey: ["emergency", created?.id, socketVersion],
    queryFn: async () => (await api.get<Emergency>(`/api/emergencies/${created!.id}`)).data,
    enabled: !!created,
    refetchInterval: 8000,
  });
  const current = liveEmergency ?? created;

  const markers: MapMarker[] = useMemo(() => {
    if (!current) return [];
    const ms: MapMarker[] = [
      { id: "pickup", lat: current.pickup_lat, lng: current.pickup_lng, kind: "pickup", label: "Pickup" },
    ];
    if (current.hospital?.lat != null) {
      ms.push({
        id: "hospital",
        lat: current.hospital.lat,
        lng: current.hospital.lng,
        kind: "hospital",
        label: current.hospital.name,
      });
    }
    if (current.ambulance?.current_lat != null && current.ambulance.current_lng != null) {
      ms.push({
        id: "ambulance",
        lat: current.ambulance.current_lat,
        lng: current.ambulance.current_lng,
        kind: "ambulance",
        label: current.ambulance.vehicle_number,
      });
    }
    return ms;
  }, [current]);

  const paths: MapPath[] = useMemo(() => {
    if (!current?.route?.legs) return [];
    const legs: MapPath[] = [];
    if (current.route.legs.to_pickup?.path?.length) {
      legs.push({ latlngs: current.route.legs.to_pickup.path, color: "#e11d48" });
    }
    if (current.route.legs.to_hospital?.path?.length) {
      legs.push({ latlngs: current.route.legs.to_hospital.path, color: "#0ea5e9" });
    }
    return legs;
  }, [current]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const lat = position?.lat ?? 13.0827;
    const lng = position?.lng ?? 80.2707;
    const vitals: Record<string, number> = {};
    if (form.heart_rate) vitals.heart_rate = Number(form.heart_rate);
    if (form.blood_pressure) vitals.blood_pressure = Number(form.blood_pressure);
    if (form.spo2) vitals.spo2 = Number(form.spo2);
    if (form.respiratory_rate) vitals.respiratory_rate = Number(form.respiratory_rate);

    const payload: EmergencyCreatePayload = {
      emergency_type: form.emergency_type,
      severity: form.severity as EmergencyCreatePayload["severity"],
      symptoms: form.symptoms || null,
      pickup_lat: lat,
      pickup_lng: lng,
      pickup_address: form.pickup_address || null,
      preferred_hospital_hint: form.preferred_hospital_hint || null,
      vitals: Object.keys(vitals).length ? vitals : null,
    };
    try {
      const res = await api.post<Emergency>("/api/emergencies", payload);
      setCreated(res.data);
      toast(`Emergency #${res.data.id} created — help is on the way`, "SUCCESS");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (current && ACTIVE_STATUSES.has(current.status)) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Help is on the way</h1>
            <p className="mt-1 text-sm text-slate-500">
              Emergency #{current.id} • {current.emergency_type} • {statusLabel(current.status)}
            </p>
          </div>
          <Badge tone="rose" pulse>
            LIVE TRACKING
          </Badge>
        </div>

        {current.assigned_ambulance_id ? (
          <Card className="border-emerald-200 ring-1 ring-emerald-100">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <Ambulance className="h-7 w-7" />
              </span>
              <div className="flex-1">
                <p className="font-extrabold text-slate-900">{current.ambulance?.vehicle_number ?? "Ambulance assigned"}</p>
                <p className="text-sm text-slate-500">
                  Driver: {current.driver?.name ?? "Assigning…"} • ETA is tracked live on the map below
                </p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex items-center gap-3">
              <Spinner />
              <p className="text-sm font-semibold text-slate-600">Searching for the nearest available ambulance…</p>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="mb-3 text-lg font-extrabold text-slate-900">Live ambulance location</h2>
          <MapView markers={markers} paths={paths} className="h-[420px] rounded-xl" />
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">Recommended hospital</p>
              <p className="font-bold text-slate-900">{current.hospital?.name ?? "—"}</p>
              {current.hospital_score != null && (
                <p className="text-xs text-slate-500">Score {current.hospital_score.toFixed(1)}/10</p>
              )}
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">Estimated distance</p>
              <p className="font-bold text-slate-900">{current.route?.legs?.to_pickup?.distance_km?.toFixed(1) ?? current.route?.distance_km?.toFixed(1) ?? "—"} km</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">Priority</p>
              <p className="font-bold text-rose-600">
                {current.priority} {current.priority_score != null && `(${current.priority_score.toFixed(1)})`}
              </p>
            </div>
          </div>
        </Card>

        <button
          onClick={() => navigate("/app/history")}
          className="text-sm font-bold text-rose-600 hover:underline"
        >
          View my emergency history →
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Request an ambulance</h1>
        <p className="mt-1 text-sm text-slate-500">
          Share what happened — MedRush AI will prioritize, assign the nearest ambulance, optimize the route and
          recommend a hospital.
        </p>
      </div>

      {geoError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-5 w-5" />
          {geoError} Using the default city center location instead. You can keep it or adjust below.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Card title="Emergency details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type of emergency">
              <Select value={form.emergency_type} onChange={set("emergency_type")}>
                {EMERGENCY_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Severity">
              <Select value={form.severity} onChange={set("severity")}>
                <option value="LOW">Low — minor complaint</option>
                <option value="MEDIUM">Medium — needs attention</option>
                <option value="HIGH">High — urgent</option>
                <option value="CRITICAL">Critical — life threatening</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Symptoms / what happened">
                <Textarea rows={3} value={form.symptoms} onChange={set("symptoms")} placeholder="e.g. Chest pain radiating to left arm, shortness of breath…" />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Vitals (optional — improves AI priority)">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Heart rate (bpm)">
              <Input type="number" placeholder="e.g. 95" value={form.heart_rate} onChange={set("heart_rate")} />
            </Field>
            <Field label="BP systolic">
              <Input type="number" placeholder="e.g. 140" value={form.blood_pressure} onChange={set("blood_pressure")} />
            </Field>
            <Field label="SpO₂ (%)">
              <Input type="number" placeholder="e.g. 94" value={form.spo2} onChange={set("spo2")} />
            </Field>
            <Field label="Resp. rate">
              <Input type="number" placeholder="e.g. 22" value={form.respiratory_rate} onChange={set("respiratory_rate")} />
            </Field>
          </div>
        </Card>

        <Card title="Pickup location">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
            <MapPin className="h-4 w-4 text-rose-500" />
            {geoLoading ? "Detecting your location…" : position ? `Using your location: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : "Location detected from your device"}
          </div>
          <div className="grid gap-4">
            <Field label="Pickup address">
              <Input value={form.pickup_address} onChange={set("pickup_address")} placeholder="Street, area, landmark…" />
            </Field>
          </div>
        </Card>

        <Card title="Hospital preference (optional)">
          <Field label="Preferred hospital">
            <Select value={form.preferred_hospital_hint} onChange={set("preferred_hospital_hint")}>
              <option value="">No preference — AI will recommend the best</option>
              {(hospitals ?? []).map((h) => (
                <option key={h.id} value={h.name}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <Stethoscope className="h-4 w-4" />
            The final hospital choice considers live bed availability, specialty and distance — preference is a hint
            only.
          </p>
        </Card>

        {profile && (
          <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <Navigation className="h-4 w-4" />
            Your medical profile ({profile.blood_group}, {profile.age ?? "age unknown"}, {profile.gender}) is attached to this request automatically.
          </p>
        )}

        <Button type="submit" size="lg" loading={loading} className="w-full" icon={<Ambulance className="h-5 w-5" />}>
          Request ambulance now
        </Button>
        <p className="text-center text-xs text-slate-400">
          This is an emergency coordination request. If this is a real emergency, call your local emergency number.
        </p>
      </form>
    </div>
  );
}