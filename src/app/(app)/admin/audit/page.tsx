import Link from "next/link";
import { AUDIT_LABEL } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/status";

const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; action?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = sp.action ? { action: sp.action } : {};
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">감사 로그</h1>
        <p className="text-sm text-slate-500">로그인, 점검 입력, 승인, 증적 업로드·다운로드 등 모든 행위가 기록됩니다. 삭제할 수 없습니다.</p>
      </div>
      <form className="card flex items-end gap-3 px-4 py-3">
        <div>
          <label className="label text-xs">행위</label>
          <select name="action" defaultValue={sp.action ?? ""} className="input input-sm">
            <option value="">전체</option>
            {Object.entries(AUDIT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-sm">조회</button>
        <span className="pb-1 text-xs text-slate-500">총 {total}건</span>
      </form>
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr>
              <th className="th">일시</th>
              <th className="th">사용자</th>
              <th className="th">행위</th>
              <th className="th">대상</th>
              <th className="th">상세</th>
              <th className="th">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="td whitespace-nowrap">{formatDate(l.createdAt, true)}</td>
                <td className="td">{l.actorName ?? "시스템"}</td>
                <td className="td">{AUDIT_LABEL[l.action] ?? l.action}</td>
                <td className="td text-xs">
                  {l.targetType === "run" && l.targetId ? (
                    <Link href={`/runs/${l.targetId}`} className="text-brand-700 hover:underline">
                      회차
                    </Link>
                  ) : (
                    l.targetType ?? "-"
                  )}
                </td>
                <td className="td max-w-md truncate font-mono text-[11px] text-slate-500" title={l.detail ?? ""}>
                  {l.detail ?? ""}
                </td>
                <td className="td font-mono text-xs text-slate-500">{l.ip ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="flex justify-center gap-2 text-sm">
        {page > 1 && (
          <Link className="btn btn-sm" href={`?page=${page - 1}${sp.action ? `&action=${sp.action}` : ""}`}>
            이전
          </Link>
        )}
        <span className="px-2 py-1 text-slate-500">
          {page} / {pages}
        </span>
        {page < pages && (
          <Link className="btn btn-sm" href={`?page=${page + 1}${sp.action ? `&action=${sp.action}` : ""}`}>
            다음
          </Link>
        )}
      </div>
    </div>
  );
}
