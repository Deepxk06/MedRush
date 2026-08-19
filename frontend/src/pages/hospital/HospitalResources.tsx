import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BedDouble, Gauge, Save, Stethoscope, Wind } from "lucide-react";
import { api, apiErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Card } from "../../components/ui/Card";
import { Field, Input } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/State";
import type { HospitalResource, ResourceUpdatePayload } from "../../types";

export default function HospitalResources() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hospitalId = user?.hospital_id;

  const { data: resources, isLoading } = useQuery({
    queryKey: ["hospital-resources", hospitalId],
    queryFn: async () => (await api.get<HospitalResource>(`/api/hospitals/${hospitalId}/resources`)).data,
    enabled: !!hospitalId,
    refetchInterval: 30000,
  });

  const [form, setForm] = useState<ResourceUpdatePayload>({});
  useMemo(() => {
    if (resources) {
      setForm({
        total_beds: resources.total_beds,
        available_beds: resources.available_beds,
        total_icu: resources.total_icu,
        available_icu: resources.available_icu,
        total_emergency_beds: resources.total_emergency_beds,
        available_emergency_beds: resources.available_emergency_beds,
        total_ventilators: resources.total_ventilators,
        available_ventilators: resources.available_ventilators,
        oxygen_capacity: resources.oxygen_capacity,
        oxygen_available: resources.oxygen_available,
        total_doctors: resources.total_doctors,
        available_doctors: resources.available_doctors,
        total_nurses: resources.total_nurses,
        available_nurses: resources.available_nurses,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources?.hospital_id, resources?.available_beds, resources?.total_beds, resources?.available_icu, resources?.total_icu, resources?.available_ventilators, resources?.total_ventilators]);

  const mutation = useMutation({
    mutationFn: async (payload: ResourceUpdatePayload) =>
      (await api.put<HospitalResource>(`/api/hospitals/${hospitalId}/resources`, payload)).data,
    onSuccess: () => {
      toast("Resources updated — AI systems notified", "SUCCESS");
      queryClient.invalidateQueries({ queryKey: ["hospital-resources", hospitalId] });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const setNum = (key: keyof ResourceUpdatePayload) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value === "" ? undefined : Number(e.target.value) }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  if (isLoading) return <Spinner label="Loading resources…" />;
  if (!resources) return <p className="text-sm text-slate-500">No resource profile found for this hospital.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Hospital resources</h1>
        <p className="mt-1 text-sm text-slate-500">
          Keep availability current — ambulance assignment and hospital recommendation depend on it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="General beds" icon={<BedDouble className="h-5 w-5" />} total={resources.total_beds} available={resources.available_beds} pct={resources.bed_usage_pct} />
        <SummaryCard label="ICU" icon={<Activity className="h-5 w-5" />} total={resources.total_icu} available={resources.available_icu} pct={resources.icu_usage_pct} />
        <SummaryCard label="Ventilators" icon={<Wind className="h-5 w-5" />} total={resources.total_ventilators} available={resources.available_ventilators} pct={resources.ventilator_usage_pct} />
        <SummaryCard label="Emergency beds" icon={<Gauge className="h-5 w-5" />} total={resources.total_emergency_beds} available={resources.available_emergency_beds} pct={0} hidePct />
      </div>

      <form onSubmit={submit}>
        <Card title="Capacity & availability">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Total beds">
              <Input type="number" min={0} value={form.total_beds ?? ""} onChange={setNum("total_beds")} />
            </Field>
            <Field label="Available beds">
              <Input type="number" min={0} value={form.available_beds ?? ""} onChange={setNum("available_beds")} />
            </Field>
            <Field label="Total ICU">
              <Input type="number" min={0} value={form.total_icu ?? ""} onChange={setNum("total_icu")} />
            </Field>
            <Field label="Available ICU">
              <Input type="number" min={0} value={form.available_icu ?? ""} onChange={setNum("available_icu")} />
            </Field>
            <Field label="Total emergency beds">
              <Input type="number" min={0} value={form.total_emergency_beds ?? ""} onChange={setNum("total_emergency_beds")} />
            </Field>
            <Field label="Available emergency beds">
              <Input type="number" min={0} value={form.available_emergency_beds ?? ""} onChange={setNum("available_emergency_beds")} />
            </Field>
            <Field label="Total ventilators">
              <Input type="number" min={0} value={form.total_ventilators ?? ""} onChange={setNum("total_ventilators")} />
            </Field>
            <Field label="Available ventilators">
              <Input type="number" min={0} value={form.available_ventilators ?? ""} onChange={setNum("available_ventilators")} />
            </Field>
            <Field label="Oxygen capacity">
              <Input type="number" min={0} value={form.oxygen_capacity ?? ""} onChange={setNum("oxygen_capacity")} />
            </Field>
            <Field label="Oxygen available">
              <Input type="number" min={0} value={form.oxygen_available ?? ""} onChange={setNum("oxygen_available")} />
            </Field>
          </div>
        </Card>

        <Card title="Staffing">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Total doctors">
              <Input type="number" min={0} value={form.total_doctors ?? ""} onChange={setNum("total_doctors")} />
            </Field>
            <Field label="Available doctors">
              <Input type="number" min={0} value={form.available_doctors ?? ""} onChange={setNum("available_doctors")} />
            </Field>
            <Field label="Total nurses">
              <Input type="number" min={0} value={form.total_nurses ?? ""} onChange={setNum("total_nurses")} />
            </Field>
            <Field label="Available nurses">
              <Input type="number" min={0} value={form.available_nurses ?? ""} onChange={setNum("available_nurses")} />
            </Field>
          </div>
        </Card>

        <Button type="submit" size="lg" loading={mutation.isPending} icon={<Save className="h-5 w-5" />}>
          Save resource update
        </Button>
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <Stethoscope className="h-4 w-4" />
          Every update is recorded to the resource history used by trend charts and AI predictions.
        </p>
      </form>
    </div>
  );
}

function SummaryCard({
  label,
  icon,
  total,
  available,
  pct,
  hidePct,
}: {
  label: string;
  icon: React.ReactNode;
  total: number;
  available: number;
  pct: number;
  hidePct?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className={`rounded-xl p-2.5 ${pct > 85 ? "bg-rose-100 text-rose-600" : "bg-sky-100 text-sky-600"}`}>{icon}</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="text-lg font-extrabold text-slate-900">
            {available} <span className="text-sm font-semibold text-slate-400">/ {total}</span>
          </p>
          {!hidePct && <p className={`text-xs font-bold ${pct > 85 ? "text-rose-600" : "text-slate-500"}`}>{pct}% used</p>}
        </div>
      </div>
    </Card>
  );
}