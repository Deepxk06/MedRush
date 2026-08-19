import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Save, UserRound } from "lucide-react";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Card } from "../components/ui/Card";
import { Field, Input, Select } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/State";
import type { PatientProfile, User } from "../types";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [profileForm, setProfileForm] = useState<Partial<PatientProfile>>({});
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "" });

  const { data: patient } = useQuery({
    queryKey: ["patient-profile"],
    queryFn: async () => (await api.get<PatientProfile>("/api/patients/me")).data,
    enabled: user?.role === "PATIENT",
  });

  const profileMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.put<User>("/api/auth/profile", payload)).data,
    onSuccess: (data) => {
      toast("Profile updated", "SUCCESS");
      void data;
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["patient-profile"] });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  const passwordMutation = useMutation({
    mutationFn: async (payload: { current_password: string; new_password: string }) =>
      (await api.post("/api/auth/change-password", payload)).data,
    onSuccess: () => {
      toast("Password changed", "SUCCESS");
      setPwForm({ current_password: "", new_password: "" });
    },
    onError: (err) => toast(apiErrorMessage(err), "DANGER"),
  });

  if (!user) return <Spinner />;

  const p = patient ?? ({} as PatientProfile);
  const base = { full_name: user.full_name, phone: user.phone ?? "" };
  const form = { full_name: profileForm.full_name ?? base.full_name, phone: profileForm.phone ?? base.phone };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">My profile</h1>
        <p className="mt-1 text-sm text-slate-500">{user.email} • {user.role}</p>
      </div>

      <Card title="Account">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={form.full_name} onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
        </div>
        <Button
          className="mt-4"
          loading={profileMutation.isPending}
          icon={<Save className="h-4 w-4" />}
          onClick={() =>
            profileMutation.mutate({
              full_name: form.full_name,
              phone: form.phone,
            })
          }
        >
          Save account
        </Button>
      </Card>

      {user.role === "PATIENT" && (
        <Card title="Medical profile">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Age">
              <Input type="number" min={0} max={130} value={profileForm.age ?? p.age ?? ""} onChange={(e) => setProfileForm((f) => ({ ...f, age: e.target.value ? Number(e.target.value) : undefined }))} />
            </Field>
            <Field label="Gender">
              <Select value={profileForm.gender ?? p.gender ?? "Male"} onChange={(e) => setProfileForm((f) => ({ ...f, gender: e.target.value }))}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </Select>
            </Field>
            <Field label="Blood group">
              <Select value={profileForm.blood_group ?? p.blood_group ?? "O+"} onChange={(e) => setProfileForm((f) => ({ ...f, blood_group: e.target.value }))}>
                {BLOOD_GROUPS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
            <div className="col-span-2 sm:col-span-3">
              <Field label="Allergies">
                <Input value={profileForm.allergies ?? p.allergies ?? ""} onChange={(e) => setProfileForm((f) => ({ ...f, allergies: e.target.value }))} />
              </Field>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Field label="Medical history">
                <Input value={profileForm.medical_history ?? p.medical_history ?? ""} onChange={(e) => setProfileForm((f) => ({ ...f, medical_history: e.target.value }))} />
              </Field>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Field label="Emergency contact name">
                <Input value={profileForm.emergency_contact_name ?? p.emergency_contact_name ?? ""} onChange={(e) => setProfileForm((f) => ({ ...f, emergency_contact_name: e.target.value }))} />
              </Field>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Field label="Emergency contact phone">
                <Input value={profileForm.emergency_contact_phone ?? p.emergency_contact_phone ?? ""} onChange={(e) => setProfileForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))} />
              </Field>
            </div>
          </div>
          <Button
            className="mt-4"
            loading={profileMutation.isPending}
            icon={<UserRound className="h-4 w-4" />}
            onClick={() =>
              profileMutation.mutate({
                full_name: form.full_name,
                phone: form.phone,
                age: profileForm.age ?? p.age ?? null,
                gender: profileForm.gender ?? p.gender ?? null,
                blood_group: profileForm.blood_group ?? p.blood_group ?? null,
                allergies: profileForm.allergies ?? p.allergies ?? null,
                medical_history: profileForm.medical_history ?? p.medical_history ?? null,
                emergency_contact_name: profileForm.emergency_contact_name ?? p.emergency_contact_name ?? null,
                emergency_contact_phone: profileForm.emergency_contact_phone ?? p.emergency_contact_phone ?? null,
              })
            }
          >
            Save medical profile
          </Button>
        </Card>
      )}

      <Card title="Change password">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password">
            <Input type="password" value={pwForm.current_password} onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))} />
          </Field>
          <Field label="New password">
            <Input type="password" minLength={6} value={pwForm.new_password} onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))} />
          </Field>
        </div>
        <Button
          className="mt-4"
          variant="outline"
          loading={passwordMutation.isPending}
          icon={<KeyRound className="h-4 w-4" />}
          onClick={() => passwordMutation.mutate(pwForm)}
        >
          Change password
        </Button>
      </Card>
    </div>
  );
}