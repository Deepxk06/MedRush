import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShieldCheck, ShieldOff, Users } from "lucide-react";
import { api } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Input } from "../../components/ui/Field";
import { Spinner, Empty } from "../../components/ui/State";
import { StatCard } from "../../components/ui/StatCard";
import type { PatientProfile } from "../../types";

export default function AdminPatients() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: patients, isLoading } = useQuery({
    queryKey: ["admin-patients", search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      return (await api.get<PatientProfile[]>(`/api/patients${params}`)).data;
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) =>
      (await api.put(`/api/patients/${id}/status`, { is_active })).data,
    onSuccess: () => {
      toast("Patient status updated", "SUCCESS");
      queryClient.invalidateQueries({ queryKey: ["admin-patients"] });
    },
    onError: () => toast("Failed to update patient", "DANGER"),
  });

  const list = patients ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Patients</h1>
          <p className="mt-1 text-sm text-slate-500">Registered patient profiles with medical context.</p>
        </div>
        <StatCard label="Total" value={list.length} icon={<Users className="h-5 w-5" />} />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…" className="pl-9" />
      </div>

      {isLoading ? (
        <Spinner label="Loading patients…" />
      ) : list.length === 0 ? (
        <Card>
          <Empty title="No patients found" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-extrabold text-slate-900">{p.full_name}</p>
                  <p className="text-xs text-slate-500">{p.email}</p>
                </div>
                <Badge tone={p.is_active ? "green" : "slate"}>{p.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>
                  <dt className="text-slate-400">Age / Gender</dt>
                  <dd className="font-bold">{p.age ?? "—"} / {p.gender ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Blood group</dt>
                  <dd className="font-bold">{p.blood_group ?? "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-400">Phone</dt>
                  <dd className="font-bold">{p.phone ?? "—"}</dd>
                </div>
                {p.allergies && (
                  <div className="col-span-2">
                    <dt className="text-slate-400">Allergies</dt>
                    <dd className="font-bold">{p.allergies}</dd>
                  </div>
                )}
                {p.medical_history && (
                  <div className="col-span-2">
                    <dt className="text-slate-400">History</dt>
                    <dd className="font-bold">{p.medical_history}</dd>
                  </div>
                )}
              </dl>
              <button
                onClick={() => statusMutation.mutate({ id: p.id, is_active: !p.is_active })}
                disabled={statusMutation.isPending}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition disabled:opacity-50 ${
                  p.is_active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                {p.is_active ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {p.is_active ? "Deactivate" : "Activate"}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}