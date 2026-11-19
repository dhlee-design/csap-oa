import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { periodLabel } from "@/lib/period";
import { formatDate, isOverdue, STATUS_LABEL } from "@/lib/status";

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; status?: string; mine?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const templates = await db.inspectionTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  const runs = await db.inspectionRun.findMany({
    where: {
      ...(sp.template ? { templateId: sp.template } : {}),
      ...(sp.status === "OVERDUE"
        ? { status: { not: "APPROVED" }, dueDate: { lt: new Date() } }
        : sp.status
          ? { status: sp.status }
          : {}),
      ...(sp.mine ? { OR: [{ inspectorId: user.id }, { approverId: user.id }] } : {}),
    },
    orderBy: [{ period: "desc" }, { template: { sortOrder: "asc" } }, { revision: "desc" }],
    include: { template: true, inspector: true, approver: true, supersededBy: { select: { id: true } } },
    take: 300,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-xl font-semibold">점검 일정</h1>

      <form className="card flex flex-wrap items-end gap-3 px-4 py-3">
        <div>
          <label className="label text-xs">점검</label>
          <select name="template" defaultValue={sp.template ?? ""} className="input input-sm">
            <option value="">전체</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs">상태</label>
          <select name="status" defaultValue={sp.status ?? ""} className="input input-sm">
            <option value="">전체</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
            <option value="OVERDUE">기한 초과</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 pb-1 text-sm">
          <input type="checkbox" name="mine" value="1" defaultChecked={!!sp.mine} /> 내 담당만
        </label>
        <button className="btn btn-sm">조회</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="th">기간</th>
              <th className="th">점검</th>
              <th className="th">상태</th>
              <th className="th">마감일</th>
              <th className="th">점검일</th>
              <th className="th">점검자</th>
              <th className="th">승인자</th>
              <th className="th">승인일</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={8}>
                  조건에 맞는 회차가 없습니다.
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} className={`hover:bg-slate-50 ${r.supersededBy ? "opacity-50" : ""}`}>
                <td className="td whitespace-nowrap">{periodLabel(r.period)}</td>
                <td className="td">
                  <Link href={`/runs/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.template.name}
                  </Link>
                  {r.revision > 0 && <span className="ml-1 text-xs text-slate-500">(정정 {r.revision})</span>}
                  {r.supersededBy && <span className="ml-1 text-xs text-slate-500">(정정됨)</span>}
                  {r.migrated && <span className="ml-1 text-xs text-slate-500">(이관)</span>}
                </td>
                <td className="td">
                  <StatusBadge status={r.status} overdue={!r.supersededBy && isOverdue(r)} />
                </td>
                <td className="td whitespace-nowrap">{formatDate(r.dueDate)}</td>
                <td className="td whitespace-nowrap">{formatDate(r.inspectedAt)}</td>
                <td className="td">{r.inspector?.name ?? "-"}</td>
                <td className="td">{r.approver?.name ?? "-"}</td>
                <td className="td whitespace-nowrap">{formatDate(r.approvedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
