// 클라이언트·서버 공용 상태 정의
export const STATUS_LABEL: Record<string, string> = {
  PLANNED: "예정",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "승인 요청",
  APPROVED: "승인 완료",
  REJECTED: "반려",
};

export const EDITABLE_STATUSES = ["PLANNED", "IN_PROGRESS", "REJECTED"];

export function isOverdue(run: { status: string; dueDate: Date | string }, now = new Date()) {
  return run.status !== "APPROVED" && new Date(run.dueDate) < now;
}

export function formatDate(d: Date | string | null | undefined, withTime = false) {
  if (!d) return "-";
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  return withTime ? `${date} ${p(x.getHours())}:${p(x.getMinutes())}` : date;
}

export function daysLeft(due: Date | string, now = new Date()) {
  const d = new Date(due);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
