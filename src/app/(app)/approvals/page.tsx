import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { periodLabel } from "@/lib/period";
import { formatDate } from "@/lib/status";

export default async function ApprovalsPage() {
  const user = await requireUser();
  const runs = await db.inspectionRun.findMany({
    where: { status: "SUBMITTED", ...(user.role === "ADMIN" ? {} : { approverId: user.id }) },
    orderBy: { submittedAt: "asc" },
    include: { template: true, inspector: true, approver: true },
  });
  const recent = await db.approval.findMany({
    where: { decision: { in: ["APPROVE", "REJECT"] }, actorId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { run: { include: { template: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-xl font-semibold">승인함</h1>
      <section className="card overflow-x-auto">
        <div className="px-4 py-3 font-semibold">승인 대기 {runs.length}건</div>
        <table className="w-full min-w-[600px]">
          <thead>
            <tr>
              <th className="th">점검</th>
              <th className="th">기간</th>
              <th className="th">점검자</th>
              <th className="th">요청일</th>
              <th className="th">승인자</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={5}>
                  승인을 기다리는 회차가 없습니다.
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="td">
                  <Link href={`/runs/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.template.name}
                  </Link>
                </td>
                <td className="td">{periodLabel(r.period)}</td>
                <td className="td">{r.inspector?.name ?? "-"}</td>
                <td className="td">{formatDate(r.submittedAt, true)}</td>
                <td className="td">{r.approver?.name ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <div className="px-4 py-3 font-semibold">내가 처리한 최근 20건</div>
        <table className="w-full min-w-[600px]">
          <thead>
            <tr>
              <th className="th">점검</th>
              <th className="th">기간</th>
              <th className="th">결정</th>
              <th className="th">의견</th>
              <th className="th">처리일</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={5}>
                  아직 없습니다.
                </td>
              </tr>
            )}
            {recent.map((a) => (
              <tr key={a.id}>
                <td className="td">
                  <Link href={`/runs/${a.runId}`} className="text-brand-700 hover:underline">
                    {a.run.template.name}
                  </Link>
                </td>
                <td className="td">{periodLabel(a.run.period)}</td>
                <td className={`td font-medium ${a.decision === "APPROVE" ? "text-emerald-700" : "text-red-700"}`}>
                  {a.decision === "APPROVE" ? "승인" : "반려"}
                </td>
                <td className="td text-slate-600">{a.comment ?? "-"}</td>
                <td className="td">{formatDate(a.createdAt, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
