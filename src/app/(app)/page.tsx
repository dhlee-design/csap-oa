import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FREQUENCY_LABEL, monthInPeriod, periodLabel, recentMonths } from "@/lib/period";
import { daysLeft, formatDate, isOverdue, STATUS_LABEL } from "@/lib/status";
import type { Frequency } from "@/lib/templates/types";

const CELL: Record<string, string> = {
  APPROVED: "bg-emerald-500 text-white",
  SUBMITTED: "bg-blue-400 text-white",
  IN_PROGRESS: "bg-amber-300 text-amber-900",
  REJECTED: "bg-red-300 text-red-900",
  PLANNED: "bg-slate-200 text-slate-600",
};

export default async function Dashboard() {
  const user = await requireUser();
  const now = new Date();
  const [templates, openRuns, recentRuns] = await Promise.all([
    db.inspectionTemplate.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { inspector: true, approver: true },
    }),
    db.inspectionRun.findMany({
      where: { status: { not: "APPROVED" }, supersededBy: null },
      orderBy: { dueDate: "asc" },
      include: { template: true, inspector: true, approver: true },
    }),
    db.inspectionRun.findMany({
      where: { supersededBy: null },
      select: { templateId: true, period: true, status: true, id: true, dueDate: true },
    }),
  ]);

  const overdue = openRuns.filter((r) => isOverdue(r, now));
  const mine = openRuns.filter(
    (r) => (r.inspectorId === user.id && r.status !== "SUBMITTED") || (r.approverId === user.id && r.status === "SUBMITTED"),
  );
  const waiting = openRuns.filter((r) => r.status === "SUBMITTED");
  const unassigned = templates.filter((t) => !t.inspectorId || !t.approverId);
  const months = recentMonths(12, now);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">대시보드</h1>
        <p className="text-sm text-slate-500">{formatDate(now)} 기준</p>
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          담당자가 지정되지 않은 점검이 {unassigned.length}건 있습니다:{" "}
          {unassigned.map((t) => t.name).join(", ")}.{" "}
          {user.role === "ADMIN" ? (
            <Link href="/admin/templates" className="font-semibold underline">
              담당자 지정하기
            </Link>
          ) : (
            "관리자에게 지정을 요청하세요."
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="미완료 점검" value={openRuns.length} />
        <Kpi label="기한 초과" value={overdue.length} tone={overdue.length ? "red" : undefined} />
        <Kpi label="승인 대기" value={waiting.length} />
        <Kpi label="내가 할 일" value={mine.length} tone={mine.length ? "brand" : undefined} />
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold">해야 할 점검</h2>
          <Link href="/runs" className="text-sm text-brand-600 hover:underline">
            전체 일정
          </Link>
        </div>
        {openRuns.length === 0 ? (
          <p className="px-4 pb-6 text-sm text-slate-500">미완료 점검이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className="th">점검</th>
                  <th className="th">기간</th>
                  <th className="th">상태</th>
                  <th className="th">마감</th>
                  <th className="th">점검자 → 승인자</th>
                </tr>
              </thead>
              <tbody>
                {openRuns.map((r) => {
                  const left = daysLeft(r.dueDate, now);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="td">
                        <Link href={`/runs/${r.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.template.name}
                        </Link>
                        {r.revision > 0 && <span className="ml-1 text-xs text-slate-500">(정정 {r.revision})</span>}
                      </td>
                      <td className="td">{periodLabel(r.period)}</td>
                      <td className="td">
                        <StatusBadge status={r.status} overdue={isOverdue(r, now)} />
                      </td>
                      <td className="td whitespace-nowrap">
                        {formatDate(r.dueDate)}{" "}
                        <span className={left < 0 ? "text-red-600" : left <= 7 ? "text-amber-600" : "text-slate-500"}>
                          ({left < 0 ? `${-left}일 지남` : left === 0 ? "오늘" : `D-${left}`})
                        </span>
                      </td>
                      <td className="td text-slate-600">
                        {r.inspector?.name ?? <span className="text-amber-600">미지정</span>} →{" "}
                        {r.approver?.name ?? <span className="text-amber-600">미지정</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="px-4 py-3">
          <h2 className="font-semibold">최근 12개월 수행 현황</h2>
          <p className="text-xs text-slate-500">빈 칸은 회차가 없는 기간입니다. 사후평가 전에 빈 달이 없는지 확인하세요.</p>
        </div>
        {/* dir="rtl": 화면이 좁아 가로 스크롤이 생기면 처음부터 오른쪽(이번 달)이 보이게 한다 */}
        <div className="px-4">
          <div className="overflow-x-auto" dir="rtl">
          <table dir="ltr" className="w-full min-w-[640px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className={`${STICKY} w-36 text-left text-xs font-medium text-slate-500`}>점검</th>
                {months.map((m) => (
                  <th key={m} className="text-center text-[11px] font-medium text-slate-500">
                    {m.slice(2).replace("-", ".")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td className={`${STICKY} pr-2 text-sm`}>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[11px] text-slate-500">{FREQUENCY_LABEL[t.frequency as Frequency]}</div>
                  </td>
                  {months.map((m) => {
                    const run = recentRuns.find((r) => r.templateId === t.id && monthInPeriod(m, r.period));
                    if (!run) return <td key={m} className="h-9 rounded-md bg-slate-50" />;
                    return (
                      <td key={m} className="h-9 p-0">
                        <Link
                          href={`/runs/${run.id}`}
                          title={`${periodLabel(run.period)} · ${STATUS_LABEL[run.status]}`}
                          className={`flex h-9 items-center justify-center rounded-md text-[10px] font-semibold ${CELL[run.status]} ${isOverdue(run, now) ? "ring-2 ring-red-500" : ""}`}
                        >
                          {run.status === "APPROVED" ? "완료" : STATUS_LABEL[run.status].slice(0, 2)}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <div className="px-4 pb-4">
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
            {Object.entries(CELL).map(([k, c]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className={`inline-block h-3 w-3 rounded ${c}`} /> {STATUS_LABEL[k]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded ring-2 ring-red-500" /> 기한 초과
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

// 가로 스크롤 때 점검명 열을 고정한다. 그림자로 셀 사이 간격(border-spacing)까지 가린다.
const STICKY = "sticky left-0 z-10 bg-white shadow-[-4px_0_0_0_white,4px_0_0_0_white]";

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "red" | "brand" }) {
  const color = tone === "red" ? "text-red-600" : tone === "brand" ? "text-brand-600" : "text-slate-900";
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
