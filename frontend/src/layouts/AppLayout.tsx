import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  Ambulance,
  Building2,
  ClipboardList,
  Cpu,
  Gauge,
  HeartPulse,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Microscope,
  Route as RouteIcon,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { NotificationsBell } from "../components/NotificationsBell";
import type { ReactNode } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const navByRole: Record<string, NavItem[]> = {
  PATIENT: [
    { to: "/app", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/app/request", label: "Request Ambulance", icon: <Ambulance className="h-4 w-4" /> },
    { to: "/app/history", label: "Emergency History", icon: <History className="h-4 w-4" /> },
    { to: "/app/profile", label: "Profile", icon: <Settings className="h-4 w-4" /> },
  ],
  DRIVER: [
    { to: "/app", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/app/profile", label: "Profile", icon: <Settings className="h-4 w-4" /> },
  ],
  HOSPITAL: [
    { to: "/app", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/app/resources", label: "Resources", icon: <Microscope className="h-4 w-4" /> },
    { to: "/app/incoming", label: "Incoming Emergencies", icon: <Activity className="h-4 w-4" /> },
    { to: "/app/predictions", label: "AI Predictions", icon: <Cpu className="h-4 w-4" /> },
    { to: "/app/profile", label: "Profile", icon: <Settings className="h-4 w-4" /> },
  ],
  ADMIN: [
    { to: "/app", label: "Overview", icon: <Gauge className="h-4 w-4" /> },
    { to: "/app/emergencies", label: "Emergencies", icon: <ClipboardList className="h-4 w-4" /> },
    { to: "/app/patients", label: "Patients", icon: <Users className="h-4 w-4" /> },
    { to: "/app/drivers", label: "Drivers", icon: <ShieldCheck className="h-4 w-4" /> },
    { to: "/app/ambulances", label: "Ambulances", icon: <Ambulance className="h-4 w-4" /> },
    { to: "/app/hospitals", label: "Hospitals", icon: <Building2 className="h-4 w-4" /> },
    { to: "/app/ai", label: "AI Models", icon: <Cpu className="h-4 w-4" /> },
    { to: "/app/audit", label: "Audit Logs", icon: <History className="h-4 w-4" /> },
    { to: "/app/demo", label: "Demo Control", icon: <RouteIcon className="h-4 w-4" /> },
    { to: "/app/profile", label: "Profile", icon: <Settings className="h-4 w-4" /> },
  ],
};

const roleColors: Record<string, string> = {
  PATIENT: "text-rose-600",
  DRIVER: "text-violet-600",
  HOSPITAL: "text-sky-600",
  ADMIN: "text-emerald-600",
};

const roleLabels: Record<string, string> = {
  PATIENT: "Patient",
  DRIVER: "Ambulance Driver",
  HOSPITAL: "Hospital Staff",
  ADMIN: "Administrator",
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) return null;
  const nav = navByRole[user.role] ?? [];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-slate-100 transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600">
            <HeartPulse className="h-6 w-6 text-white" />
          </span>
          <div>
            <p className="text-base font-extrabold tracking-tight">
              MEDRUSH <span className="text-rose-400">AI</span>
            </p>
            <p className={`text-[10px] font-semibold uppercase ${roleColors[user.role]}`}>{roleLabels[user.role]}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  isActive ? "bg-rose-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 px-5 py-4">
          <p className="truncate text-sm font-bold">{user.full_name}</p>
          <p className="truncate text-xs text-slate-400">{user.email}</p>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"}`}
            />
            <span className="text-xs text-slate-400">{connected ? "Live connection" : "Reconnecting…"}</span>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <button
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex">
            <MapPin className="h-4 w-4 text-rose-500" />
            MedRush AI — Emergency Healthcare Management
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <button
              onClick={() => navigate("/app/profile")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700"
              aria-label="Profile"
            >
              {user.full_name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}