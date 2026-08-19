import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ambulance, Search, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { api, apiErrorMessage } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Field, Input } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { Spinner, Empty } from "../../components/ui/State";
import { StatCard } from "../../components/ui/StatCard";
import type { DriverAdmin } from "../../types";

export default function AdminDrivers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["admin-drivers", search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      return (await api.get<DriverAdmin[]>(`/api/ambulances/drivers${params}`)).data;
    },
  });

  const { data: ambulances } = useQuery({
    queryKey: ["ambulances"],
    queryFn: async () => (await api.get<{ id: number; vehicle_number: string; status: string }[]>("/api/ambulances")).data,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) =>
      (await api.put(`/api/ambulances/drivers/${id}`, { is_active })).data,
    onSuccess: () => {
      toast("Driver status updated", "SUCCESS");
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/api/ambulances/drivers", payload)).data,
    onSuccess: () => {
      toast("Driver account created", "SUCCESS");
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const list = drivers ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Drivers</h1>
          <p className="mt-1 text-sm text-slate-500">Ambulance drivers with live availability.</p>
        </div>
        <div className="flex items-center gap-3">
          <StatCard label="Total" value={list.length} icon={<Ambulance className="h-5 w-5" />} />
          <Button onClick={() => setCreateOpen(true)} icon={<UserPlus className="h-4 w-4" />}>
            Add driver
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email…" className="pl-9" />
      </div>

      {isLoading ? (
        <Spinner label="Loading drivers…" />
      ) : list.length === 0 ? (
        <Card>
          <Empty title="No drivers found" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-extrabold text-slate-900">{d.full_name}</p>
                  <p className="text-xs text-slate-500">{d.email}</p>
                </div>
                <Badge tone={d.is_active ? "green" : "slate"}>{d.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>
                  <dt className="text-slate-400">License</dt>
                  <dd className="font-bold">{d.license_number}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Status</dt>
                  <dd className="font-bold">{d.is_available ? "Available" : "Busy / offline"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Phone</dt>
                  <dd className="font-bold">{d.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Ambulance</dt>
                  <dd className="font-bold">{d.ambulance_number ?? "Not assigned"}</dd>
                </div>
              </dl>
              <button
                onClick={() => statusMutation.mutate({ id: d.id, is_active: !d.is_active })}
                disabled={statusMutation.isPending}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition disabled:opacity-50 ${
                  d.is_active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                {d.is_active ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {d.is_active ? "Deactivate" : "Activate"}
              </button>
            </Card>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create driver account">
        <DriverForm
          ambulances={ambulances ?? []}
          loading={createMutation.isPending}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      </Modal>
    </div>
  );
}

function DriverForm({
  ambulances,
  loading,
  onSubmit,
}: {
  ambulances: { id: number; vehicle_number: string; status: string }[];
  loading: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    license_number: "",
    ambulance_id: "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      ambulance_id: form.ambulance_id ? Number(form.ambulance_id) : undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Full name">
        <Input required value={form.full_name} onChange={set("full_name")} />
      </Field>
      <Field label="Email">
        <Input type="email" required value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Password">
        <Input type="password" required minLength={6} value={form.password} onChange={set("password")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone">
          <Input value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="License number">
          <Input required value={form.license_number} onChange={set("license_number")} />
        </Field>
      </div>
      <Field label="Assign ambulance (optional)">
        <select
          value={form.ambulance_id}
          onChange={set("ambulance_id")}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
        >
          <option value="">Not assigned</option>
          {(ambulances ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.vehicle_number} ({a.status})
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" loading={loading} className="w-full">
        Create driver
      </Button>
    </form>
  );
}