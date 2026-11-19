import { STATUS_LABEL } from "@/lib/status";

const COLOR: Record<string, string> = {
  PLANNED: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  SUBMITTED: "bg-blue-50 text-blue-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      <span className={`badge ${COLOR[status] ?? COLOR.PLANNED}`}>{STATUS_LABEL[status] ?? status}</span>
      {overdue && <span className="badge bg-red-600 text-white">기한 초과</span>}
    </span>
  );
}
