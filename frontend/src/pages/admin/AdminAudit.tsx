import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { api } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Select } from "../../components/ui/Field";
import { Spinner, Empty } from "../../components/ui/State";
import type { AuditLogEntry } from "../../types";

const ACTION_TONE: Record<string, "slate" | "red" | "green" | "amber" | "sky"> = {
  emergency_created: "red",
  emergency_status_changed: "amber",
  emergency_cancelled: "red",
  ambulance_assigned: "sky",
  driver_accepted: "green",
  driver_rejected: "amber",
  patient_registered: "sky",
  user_login: "sky",
  user_logout: "slate",
  resource_updated: "green",
  demo_simulation_started: "amber",
  demo_simulation_stopped: "slate",
  sos_alert: "red",
};

const ACTIONS = ["", "emergency_created", "emergency_status_changed", "emergency_cancelled", "ambulance_assigned", "driver_accepted", "driver_rejected", "patient_registered", "user_login", "user_logout", "resource_updated", "sos_alert", "demo_simulation_started", "demo_simulation_stopped"];

export default function AdminAudit() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["audit", action, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), page_size: "50" });
      if (action) params.set("action", action);
      return (await api.get<{ total: number; items: AuditLogEntry[] }>(`/api/admin/audit-logs?${params}`)).data;
    },
  });

  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Audit logs</h1>
          <p className="mt-1 text-sm text-slate-500">Every critical action in the system, logged with actor and IP.</p>
        </div>
        <Badge tone="slate">{data?.total ?? 0} entries</Badge>
      </div>

      <div className="max-w-sm">
        <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">All actions</option>
          {ACTIONS.filter(Boolean).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <Spinner label="Loading audit logs…" />
      ) : items.length === 0 ? (
        <Card>
          <Empty title="No audit entries" />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {items.map((log) => (
              <li key={log.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500">
                  <ScrollText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={ACTION_TONE[log.action] ?? "slate"}>{log.action}</Badge>
                    <span className="text-xs text-slate-400">
                      {log.user_email ?? "system"} • {log.entity_type ? `${log.entity_type}#${log.entity_id ?? ""}` : "—"}
                    </span>
                  </div>
                  {log.metadata_json && log.metadata_json !== "{}" && (
                    <p className="mt-1 truncate font-mono text-xs text-slate-500">{log.metadata_json}</p>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs text-slate-400">
                  <p>{new Date(log.created_at).toLocaleString()}</p>
                  <p>{log.ip_address ?? ""}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}