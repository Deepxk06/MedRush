import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-200 border-t-rose-600" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Empty({
  title = "Nothing here yet",
  desc,
  action,
}: {
  title?: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-400">
      <Info className="h-8 w-8" />
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {desc && <p className="max-w-sm text-xs">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 py-10 text-red-700">
      <AlertTriangle className="h-8 w-8" />
      <p className="max-w-md text-center text-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function SuccessIcon({ className = "h-8 w-8" }: { className?: string }) {
  return <CheckCircle2 className={`${className} text-emerald-500`} />;
}