import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeartPulse, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { apiErrorMessage } from "../api/client";

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@medrush.ai", password: "admin123" },
  { label: "Patient", email: "patient@demo.com", password: "patient123" },
  { label: "Driver", email: "driver@demo.com", password: "driver123" },
  { label: "Hospital", email: "staff1@medrush.ai", password: "hospital123" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === "ADMIN" ? "/app" : "/app", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fill = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Visual panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-rose-700 via-rose-900 to-slate-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <HeartPulse className="h-7 w-7" />
          </span>
          <p className="text-xl font-extrabold tracking-tight">
            MEDRUSH <span className="text-rose-300">AI</span>
          </p>
        </div>
        <div>
          <h1 className="max-w-lg text-4xl font-extrabold leading-tight">
            AI-Powered Emergency Healthcare Management
          </h1>
          <p className="mt-4 max-w-md text-rose-100/90">
            Intelligent ambulance dispatch, hospital resource prediction, route optimization and real-time
            tracking — one connected platform from call to admission.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-rose-100/80">
            <ShieldCheck className="h-5 w-5" />
            Decision-support system — emergency medical decisions remain with healthcare professionals.
          </div>
        </div>
        <p className="text-xs text-rose-200/60">Final-year academic project • MedRush AI v1.0</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col justify-center bg-slate-50 px-6 py-10 sm:px-12 lg:max-w-xl">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600">
              <HeartPulse className="h-6 w-6 text-white" />
            </span>
            <p className="text-lg font-extrabold text-slate-900">
              MEDRUSH <span className="text-rose-600">AI</span>
            </p>
          </div>

          <h2 className="text-2xl font-extrabold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to your MedRush AI account.</p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email">
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              Remember me
            </label>
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Sign in
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Demo accounts — one-click fill</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.label}
                  onClick={() => fill(acc.email, acc.password)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-rose-300 hover:bg-rose-50"
                >
                  <span className="block font-bold text-slate-800">{acc.label}</span>
                  <span className="block truncate text-slate-400">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            New patient?{" "}
            <Link to="/register" className="font-bold text-rose-600 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}