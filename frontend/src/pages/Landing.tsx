import { Link } from "react-router-dom";
import {
  Ambulance,
  Brain,
  HeartPulse,
  Map,
  Route as RouteIcon,
  ShieldAlert,
  Stethoscope,
  Users,
} from "lucide-react";
import { Button } from "../components/ui/Button";

const FEATURES = [
  {
    icon: <Brain className="h-6 w-6" />,
    title: "AI Hospital Resource Prediction",
    desc: "Machine-learning models forecast bed, ICU and ventilator demand so hospitals can prepare before patients arrive.",
  },
  {
    icon: <Ambulance className="h-6 w-6" />,
    title: "Intelligent Ambulance Dispatch",
    desc: "The nearest suitable ambulance is assigned automatically based on emergency priority and travel time.",
  },
  {
    icon: <RouteIcon className="h-6 w-6" />,
    title: "Route Optimization",
    desc: "Emergency-weighted routing chooses the fastest path, not just the shortest, using OSRM with an offline fallback.",
  },
  {
    icon: <Map className="h-6 w-6" />,
    title: "Real-Time Ambulance Tracking",
    desc: "Live GPS updates flow through WebSockets — patients watch their ambulance arrive on an interactive map.",
  },
  {
    icon: <Stethoscope className="h-6 w-6" />,
    title: "Hospital Recommendation",
    desc: "Each emergency is scored against every hospital's live capacity, specialty match and proximity.",
  },
  {
    icon: <ShieldAlert className="h-6 w-6" />,
    title: "Emergency Management",
    desc: "A full request-to-admission workflow with status tracking, notifications and audit logging for every action.",
  },
];

const STEPS = [
  { n: "01", title: "Patient requests", desc: "Emergency details, location and vitals are captured." },
  { n: "02", title: "AI prioritizes", desc: "Severity, symptoms, age and vitals are scored for dispatch urgency." },
  { n: "03", title: "Ambulance assigned", desc: "Best route optimized, driver notified, hospital recommended." },
  { n: "04", title: "Live tracking", desc: "Patient and hospital follow the ambulance in real time." },
  { n: "05", title: "Admission", desc: "Hospital resources are reserved and the emergency is completed." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-5 lg:px-12">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600">
            <HeartPulse className="h-6 w-6" />
          </span>
          <p className="text-lg font-extrabold tracking-tight">
            MEDRUSH <span className="text-rose-400">AI</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" className="text-white hover:bg-white/10">
              Sign in
            </Button>
          </Link>
          <Link to="/register">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-20 text-center lg:px-12 lg:py-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(225,29,72,0.35),transparent_60%)]" />
        <div className="relative mx-auto max-w-3xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-4 py-1 text-sm font-semibold text-rose-300">
            <Brain className="h-4 w-4" /> AI-Powered Emergency Healthcare Management
          </p>
          <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">
            When every minute matters,{" "}
            <span className="bg-gradient-to-r from-rose-400 to-amber-300 bg-clip-text text-transparent">
              MedRush AI
            </span>{" "}
            responds first.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            From a patient's emergency call to hospital admission — AI predicts resources, dispatches the right
            ambulance, optimizes the fastest route and keeps everyone connected in real time.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link to="/register">
              <Button size="lg" icon={<HeartPulse className="h-5 w-5" />}>
                Get Started
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10">
                Explore Demo Accounts
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-xs text-slate-400">
            Demo: admin@medrush.ai / admin123 • patient@demo.com / patient123 • driver@demo.com / driver123 • staff1@medrush.ai / hospital123
          </p>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-white/10 bg-white/5">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-10 text-center sm:grid-cols-4">
          {[
            { v: "4+", l: "User roles" },
            { v: "5", l: "Resources predicted" },
            { v: "100%", l: "Database-driven" },
            { v: "Real-time", l: "WebSocket updates" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-3xl font-extrabold text-rose-400">{s.v}</p>
              <p className="mt-1 text-sm text-slate-400">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-extrabold">Everything connected, nothing simulated</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
          Every module talks to the same backend and database — patient, ambulance, driver, hospital and admin
          dashboards update from one source of truth.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-rose-500/50">
              <span className="inline-flex rounded-xl bg-rose-500/15 p-3 text-rose-400">{f.icon}</span>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="border-t border-white/10 bg-white/5 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-3xl font-extrabold">The emergency workflow</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3 lg:grid-cols-5">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <p className="text-4xl font-extrabold text-rose-500/40">{s.n}</p>
                <h3 className="mt-2 font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-extrabold">Built for every responder</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <Users className="h-6 w-6" />, title: "Patients", desc: "Request help, track the ambulance live, follow the trip to admission." },
            { icon: <Ambulance className="h-6 w-6" />, title: "Drivers", desc: "Accept assignments, navigate the optimized route, update status one tap at a time." },
            { icon: <Stethoscope className="h-6 w-6" />, title: "Hospitals", desc: "Manage beds, ICU and ventilators; see incoming emergencies and AI demand forecasts." },
            { icon: <ShieldAlert className="h-6 w-6" />, title: "Admins", desc: "Live analytics, fleet and user management, audit logs and a demo control center." },
          ].map((r) => (
            <div key={r.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <span className="inline-flex rounded-xl bg-sky-500/15 p-3 text-sky-400">{r.icon}</span>
              <h3 className="mt-4 text-lg font-bold">{r.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{r.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 text-center">
          <Link to="/register">
            <Button size="lg">Get Started</Button>
          </Link>
        </div>
      </section>

      {/* Disclaimer + footer */}
      <footer className="border-t border-white/10 px-6 py-10 text-center">
        <p className="mx-auto max-w-2xl text-xs text-slate-500">
          Medical disclaimer: MedRush AI is an emergency coordination and decision-support system. It does not
          diagnose diseases and does not replace doctors. All AI recommendations are advisory — emergency medical
          decisions remain with qualified healthcare professionals.
        </p>
        <p className="mt-4 text-xs text-slate-600">© 2026 MedRush AI — Final-year academic project</p>
      </footer>
    </div>
  );
}