import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ambulance,
  CheckCircle2,
  CircleCheck,
  DoorOpen,
  Flag,
  MapPin,
  Navigation,
  Radio,
  Siren,
  TriangleAlert,
} from "lucide-react";
import { api, apiErrorMessage } from "../../api/client";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useToast } from "../../context/ToastContext";
import { useSocket } from "../../context/SocketContext";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { StatCard } from "../../components/ui/StatCard";
import { Empty } from "../../components/ui/State";
import MapView, { type MapMarker, type MapPath } from "../../components/maps/MapView";
import { statusLabel } from "../../components/StatusTimeline";
import type { DriverInfo, Emergency } from "../../types";

const ACTIONS: { action: string; label: string; icon: React.ReactNode }[] = [
  { action: "START_JOURNEY", label: "Start journey to pickup", icon: <Navigation className="h-4 w-4" /> },
  { action: "ARRIVED_AT_PICKUP", label: "Arrived at pickup", icon: <MapPin className="h-4 w-4" /> },
  { action: "PATIENT_PICKED_UP", label: "Patient picked up", icon: <DoorOpen className="h-4 w-4" /> },
  { action: "START_HOSPITAL_JOURNEY", label: "Heading to hospital", icon: <Navigation className="h-4 w-4" /> },
  { action: "ARRIVED_AT_HOSPITAL", label: "Arrived at hospital", icon: <Flag className="h-4 w-4" /> },
  { action: "COMPLETE_TRIP", label: "Complete trip", icon: <CircleCheck className="h-4 w-4" /> },
];

export default function DriverDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { position, locate } = useGeolocation();
  const [tripVersion, setTripVersion] = useState(0);
  const [sosOpen, setSosOpen] = useState(false);

  const { data: driver } = useQuery({
    queryKey: ["driver-me"],
    queryFn: async () => (await api.get<DriverInfo>("/api/drivers/me")).data,
  });

  const { data: tripData } = useQuery({
    queryKey: ["driver-trip", tripVersion],
    queryFn: async () => (await api.get<{ emergency: Emergency | null }>("/api/drivers/me/active-emergency")).data,
    refetchInterval: 15000,
  });
  const trip = tripData?.emergency ?? null;

  const { on, connected } = useSocket();
  useEffect(() => {
    if (!connected) return;
    const unsubs = [
      on("emergency_created", () => setTripVersion((v) => v + 1)),
      on("status_updated", () => setTripVersion((v) => v + 1)),
      on("driver_accepted", () => setTripVersion((v) => v + 1)),
      on("ambulance_location_updated", () => setTripVersion((v) => v + 1)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [on, connected]);

  useEffect(() => {
    if (trip) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  const locationMutation = useMutation({
    mutationFn: async () => {
      if (!position) return;
      await api.post("/api/drivers/me/location", { lat: position.lat, lng: position.lng });
    },
    onSuccess: () => setTripVersion((v) => v + 1),
  });

  useEffect(() => {
    if (!position || !trip) return;
    const id = setInterval(() => locationMutation.mutate(), 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, trip]);

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ emergency: Emergency }>(`/api/drivers/emergencies/${trip!.id}/accept`);
      return res.data;
    },
    onSuccess: () => {
      toast("Assignment accepted", "SUCCESS");
      queryClient.invalidateQueries({ queryKey: ["driver-trip"] });
      setTripVersion((v) => v + 1);
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/drivers/emergencies/${trip!.id}/reject`);
    },
    onSuccess: () => {
      toast("Assignment rejected — another driver will be assigned", "INFO");
      queryClient.invalidateQueries({ queryKey: ["driver-trip"] });
      setTripVersion((v) => v + 1);
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await api.post<{ emergency: Emergency }>(`/api/drivers/emergencies/${trip!.id}/status`, { action });
      return res.data;
    },
    onSuccess: (data) => {
      toast(statusLabel(data.emergency?.status ?? ""), "SUCCESS");
      queryClient.invalidateQueries({ queryKey: ["driver-trip"] });
      setTripVersion((v) => v + 1);
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const sosMutation = useMutation({
    mutationFn: async (notes: string) => {
      await api.post("/api/drivers/me/sos", { notes });
    },
    onSuccess: () => {
      toast("SOS sent — administrators have been alerted", "SUCCESS");
      setSosOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const markers: MapMarker[] = useMemo(() => {
    if (!trip) return [];
    const ms: MapMarker[] = [
      { id: "pickup", lat: trip.pickup_lat, lng: trip.pickup_lng, kind: "pickup", label: "Pickup" },
    ];
    if (trip.hospital?.lat != null) {
      ms.push({ id: "hospital", lat: trip.hospital.lat, lng: trip.hospital.lng, kind: "hospital", label: trip.hospital.name });
    }
    if (trip.ambulance?.current_lat != null && trip.ambulance.current_lng != null) {
      ms.push({ id: "ambulance", lat: trip.ambulance.current_lat, lng: trip.ambulance.current_lng, kind: "ambulance", label: trip.ambulance.vehicle_number });
    }
    return ms;
  }, [trip]);

  const paths: MapPath[] = useMemo(() => {
    if (!trip?.route?.legs) return [];
    const legs: MapPath[] = [];
    if (trip.route.legs.to_pickup?.path?.length) {
      legs.push({ latlngs: trip.route.legs.to_pickup.path, color: "#e11d48" });
    }
    if (trip.route.legs.to_hospital?.path?.length) {
      legs.push({ latlngs: trip.route.legs.to_hospital.path, color: "#0ea5e9" });
    }
    return legs;
  }, [trip]);

  const allowedActions = useMemo(() => {
    if (!trip) return [];
    const next: Record<string, string[]> = {
      AMBULANCE_ASSIGNED: ["START_JOURNEY", "REJECT"],
      DRIVER_EN_ROUTE: ["ARRIVED_AT_PICKUP"],
      ARRIVED_AT_PICKUP: ["PATIENT_PICKED_UP"],
      PATIENT_PICKED_UP: ["START_HOSPITAL_JOURNEY"],
      EN_ROUTE_TO_HOSPITAL: ["ARRIVED_AT_HOSPITAL"],
      ARRIVED_AT_HOSPITAL: ["COMPLETE_TRIP"],
    };
    return next[trip.status] ?? [];
  }, [trip]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Driver console</h1>
          <p className="mt-1 text-sm text-slate-500">
            {driver?.ambulance?.vehicle_number ?? "Ambulance"} • {driver?.is_available ? "Available for assignments" : "On duty"}
          </p>
        </div>
        <Badge tone={connected ? "green" : "amber"} pulse={connected}>
          <Radio className="h-3 w-3" /> {connected ? "GPS reporting" : "Reconnecting"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Current trip" value={trip ? `#${trip.id}` : "None"} icon={<Ambulance className="h-5 w-5" />} tone={trip ? "rose" : "green"} />
        <StatCard label="Trip status" value={trip ? statusLabel(trip.status) : "Idle"} icon={<Flag className="h-5 w-5" />} />
        <StatCard label="Patient" value={trip?.patient_name ?? "—"} icon={<MapPin className="h-5 w-5" />} />
      </div>

      {!trip ? (
        <Card>
          <Empty
            title="No active trip"
            desc="New assignments appear here instantly via live updates. GPS reporting starts automatically when a trip begins."
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-extrabold text-slate-900">Trip #{trip.id} — {trip.emergency_type}</h2>
                <p className="text-xs text-slate-500">
                  {trip.patient_name ?? `Patient #${trip.patient_id}`} • {trip.patient_age ?? "?"}y • {trip.severity} •{" "}
                  {statusLabel(trip.status)}
                </p>
              </div>
              <Badge tone="rose" pulse>
                LIVE
              </Badge>
            </div>

            <div className="py-4">
              <MapView markers={markers} paths={paths} className="h-96 rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Distance</p>
                <p className="font-bold text-slate-900">{trip.route?.legs?.to_pickup?.distance_km?.toFixed(1) ?? trip.route?.distance_km?.toFixed(1) ?? "—"} km</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Est. duration</p>
                <p className="font-bold text-slate-900">{trip.route?.legs?.to_pickup?.duration_min?.toFixed(0) ?? trip.route?.duration_min?.toFixed(0) ?? "—"} min</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Hospital</p>
                <p className="font-bold text-slate-900">{trip.hospital?.name ?? "—"}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Priority</p>
                <p className="font-bold text-rose-600">{trip.priority}</p>
              </div>
            </div>

            {trip.symptoms && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span className="font-bold">Symptom report:</span> {trip.symptoms}
              </p>
            )}
          </Card>

          <div className="space-y-4 lg:col-span-2">
            <Card title="Trip actions">
              {trip.status === "AMBULANCE_ASSIGNED" ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">An emergency has been assigned to you. Accept to start the mission.</p>
                  <Button
                    className="w-full"
                    loading={acceptMutation.isPending}
                    onClick={() => acceptMutation.mutate()}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  >
                    Accept assignment
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-red-600"
                    loading={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate()}
                  >
                    Reject assignment
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {allowedActions.includes("REJECT") && (
                    <Button variant="outline" className="w-full text-red-600" onClick={() => rejectMutation.mutate()}>
                      Reject assignment
                    </Button>
                  )}
                  {ACTIONS.filter((a) => allowedActions.includes(a.action)).map((a) => (
                    <Button
                      key={a.action}
                      className="w-full"
                      variant={a.action === "COMPLETE_TRIP" ? "success" : "primary"}
                      loading={actionMutation.isPending}
                      onClick={() => actionMutation.mutate(a.action)}
                      icon={a.icon}
                    >
                      {a.label}
                    </Button>
                  ))}
                  {allowedActions.length === 0 && (
                    <p className="text-sm text-slate-500">Waiting for the next step in this trip…</p>
                  )}
                </div>
              )}
            </Card>

            <Card title="Trip details">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-400">Pickup address</dt>
                  <dd className="text-right font-semibold text-slate-800">{trip.pickup_address ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Contact</dt>
                  <dd className="font-semibold text-slate-800">{trip.contact_phone ?? trip.patient_name ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Blood group</dt>
                  <dd className="font-semibold text-slate-800">{trip.blood_group ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Allergies</dt>
                  <dd className="font-semibold text-slate-800">{trip.allergies ?? "None"}</dd>
                </div>
                {trip.medical_history && (
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-slate-400">History</dt>
                    <dd className="text-right font-semibold text-slate-800">{trip.medical_history}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-400">Emergency notes</dt>
                  <dd className="font-semibold text-slate-800">{trip.emergency_type}</dd>
                </div>
              </dl>
            </Card>

            <Card title="Safety">
              <Button
                variant="danger"
                className="w-full"
                icon={<Siren className="h-4 w-4" />}
                onClick={() => setSosOpen(true)}
              >
                Send SOS
              </Button>
              <p className="mt-2 text-xs text-slate-400">
                Alerts all administrators with your live location. Use only for genuine emergencies.
              </p>
            </Card>
          </div>
        </div>
      )}

      {sosOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSosOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <TriangleAlert className="h-6 w-6" />
              </span>
              <div>
                <h3 className="font-extrabold text-slate-900">Send SOS</h3>
                <p className="text-xs text-slate-500">Admins will be alerted immediately.</p>
              </div>
            </div>
            <SosForm onSubmit={(notes) => sosMutation.mutate(notes)} loading={sosMutation.isPending} onCancel={() => setSosOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function SosForm({ onSubmit, onCancel, loading }: { onSubmit: (notes: string) => void; onCancel: () => void; loading: boolean }) {
  const [notes, setNotes] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(notes);
      }}
      className="mt-4 space-y-4"
    >
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Describe the situation (optional)…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" loading={loading} className="flex-1">
          Confirm SOS
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}