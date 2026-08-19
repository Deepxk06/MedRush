import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeartPulse } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Field";
import { apiErrorMessage } from "../api/client";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    age: "",
    gender: "Male",
    blood_group: "O+",
    allergies: "",
    medical_history: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({
        ...form,
        role: "PATIENT",
        age: form.age ? Number(form.age) : null,
      });
      navigate("/app", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600">
            <HeartPulse className="h-6 w-6 text-white" />
          </span>
          <div>
            <p className="text-lg font-extrabold text-slate-900">
              MEDRUSH <span className="text-rose-600">AI</span>
            </p>
            <p className="text-xs text-slate-500">Patient registration</p>
          </div>
        </div>

        <h2 className="text-xl font-extrabold text-slate-900">Create your patient account</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your medical profile helps the AI prioritize your emergency correctly.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={submit} className="mt-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Full name">
              <Input required value={form.full_name} onChange={set("full_name")} placeholder="Your name" />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Field label="Email">
              <Input type="email" required value={form.email} onChange={set("email")} placeholder="you@example.com" />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Field label="Password">
              <Input type="password" required minLength={6} value={form.password} onChange={set("password")} placeholder="Min 6 characters" />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Field label="Phone">
              <Input value={form.phone} onChange={set("phone")} placeholder="98765 00000" />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Field label="Age">
              <Input type="number" min={0} max={130} value={form.age} onChange={set("age")} placeholder="e.g. 34" />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Field label="Gender">
              <Select value={form.gender} onChange={set("gender")}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </Select>
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Field label="Blood group">
              <Select value={form.blood_group} onChange={set("blood_group")}>
                {BLOOD_GROUPS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Allergies">
              <Input value={form.allergies} onChange={set("allergies")} placeholder="e.g. Penicillin (or None)" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Medical history">
              <Input value={form.medical_history} onChange={set("medical_history")} placeholder="e.g. Hypertension, Diabetes" />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Field label="Emergency contact name">
              <Input value={form.emergency_contact_name} onChange={set("emergency_contact_name")} />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Field label="Emergency contact phone">
              <Input value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
            </Field>
          </div>
          <div className="col-span-2">
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Create account
            </Button>
          </div>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Already registered?{" "}
          <Link to="/login" className="font-bold text-rose-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}