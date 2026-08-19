import { useQuery } from "@tanstack/react-query";
import {
  Ambulance,
  BedDouble,
  Building2,
  ClipboardList,
  Clock,
  Gauge,
  HeartPulse,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { api } from "../../api/client";
import { useSocketRefresh } from "../../hooks/useSocketRefresh";
import { Card } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";
import { Spinner } from "../../components/ui/State";
import { Badge } from "../../components/ui/Badge";
import type { AdminAnalytics, AdminOverview } from "../../types";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "#10b981",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#e11d48",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "#10b981",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#e11d48",
};

export default function AdminOverview() {
  const socketVersion = useSocketRefresh();

  const { data: overview } = useQuery({
    queryKey: ["admin-overview", socketVersion],
    queryFn: async () => (await api.get<AdminOverview>("/api/admin/overview")).data,
    refetchInterval: 20000,
  });

  const { data: analytics } = useQuery({
    queryKey: ["admin-analytics", socketVersion],
    queryFn: async () => (await api.get<AdminAnalytics>("/api/admin/analytics?days=30")).data,
    refetchInterval: 60000,
  });

  if (!overview) return <Spinner label="Loading live dashboard…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">System overview</h1>
          <p className="mt-1 text-sm text-slate-500">Live statistics across the entire MedRush AI network.</p>
        </div>
        <Badge tone="rose" pulse>
          LIVE
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active emergencies" value={overview.active_emergencies} icon={<HeartPulse className="h-5 w-5" />} tone={overview.active_emergencies > 0 ? "rose" : "green"} />
        <StatCard label="Total emergencies" value={overview.total_emergencies} icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="Ambulances" value={`${overview.available_ambulances}/${overview.total_ambulances} free`} icon={<Ambulance className="h-5 w-5" />} />
        <StatCard label="Ambulance utilization" value={`${overview.ambulance_utilization_pct}%`} icon={<Gauge className="h-5 w-5" />} tone={overview.ambulance_utilization_pct > 70 ? "amber" : "green"} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Users" value={overview.total_users} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Active patients" value={overview.active_patients} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Hospitals" value={`${overview.active_hospitals}/${overview.total_hospitals} active`} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Bed utilization" value={`${overview.hospital_bed_utilization_pct}%`} icon={<BedDouble className="h-5 w-5" />} tone={overview.hospital_bed_utilization_pct > 85 ? "rose" : "green"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Average response times">
          <dl className="space-y-4">
            <TimeRow label="Request → ambulance assigned" seconds={overview.avg_response_sec} icon={<Timer className="h-4 w-4" />} />
            <TimeRow label="Request → patient picked up" seconds={overview.avg_pickup_sec} icon={<Clock className="h-4 w-4" />} />
            <TimeRow label="Pickup → hospital arrival" seconds={overview.avg_travel_sec} icon={<Ambulance className="h-4 w-4" />} />
          </dl>
        </Card>

        <Card title="Emergency outcomes">
          <dl className="space-y-4">
            <OutcomeRow label="Completed" value={overview.completed_emergencies} tone="green" />
            <OutcomeRow label="Active" value={overview.active_emergencies} tone="rose" />
            <OutcomeRow label="Cancelled" value={overview.cancelled_requests} tone="slate" />
          </dl>
        </Card>

        <Card title="Capacity summary">
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">General beds available</dt>
              <dd className="font-extrabold text-slate-900">
                {overview.available_beds} <span className="font-semibold text-slate-400">/ {overview.total_beds}</span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">ICU beds available</dt>
              <dd className="font-extrabold text-slate-900">
                {overview.available_icu} <span className="font-semibold text-slate-400">/ {overview.total_icu}</span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Available drivers</dt>
              <dd className="font-extrabold text-slate-900">
                {overview.available_drivers} <span className="font-semibold text-slate-400">/ {overview.total_drivers}</span>
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {analytics && (
        <>
          <Card title="Emergencies over the last 30 days">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={analytics.daily_emergencies} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Emergencies" fill="#e11d48" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="By severity">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={analytics.by_severity} dataKey="count" nameKey="severity" innerRadius={50} outerRadius={90} label>
                    {analytics.by_severity.map((s) => (
                      <Cell key={s.severity} fill={SEVERITY_COLORS[s.severity] ?? "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card title="By AI priority">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={analytics.by_priority} dataKey="count" nameKey="priority" innerRadius={50} outerRadius={90} label>
                    {analytics.by_priority.map((s) => (
                      <Cell key={s.priority} fill={PRIORITY_COLORS[s.priority] ?? "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title="Ambulance usage">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={analytics.ambulance_usage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="vehicle" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="assignments" name="Assignments" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                <Bar dataKey="busy_hours" name="Busy hours" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  );
}

function TimeRow({ label, seconds, icon }: { label: string; seconds: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="rounded-lg bg-slate-100 p-2 text-slate-500">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">across all completed trips</p>
      </div>
      <p className="font-extrabold text-slate-900">{seconds > 0 ? `${(seconds / 60).toFixed(1)} min` : "—"}</p>
    </div>
  );
}

function OutcomeRow({ label, value, tone }: { label: string; value: number; tone: "green" | "rose" | "slate" }) {
  const colors = { green: "text-emerald-600", rose: "text-rose-600", slate: "text-slate-600" };
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className={`text-2xl font-extrabold ${colors[tone]}`}>{value}</p>
    </div>
  );
}