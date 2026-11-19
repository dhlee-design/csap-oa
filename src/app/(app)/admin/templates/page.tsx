import { AssignRow } from "@/components/admin/AssignRow";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { FREQUENCY_LABEL, periodLabel } from "@/lib/period";
import { parseSchema } from "@/lib/runs";
import type { Frequency } from "@/lib/templates/types";

export default async function TemplatesPage() {
  await requireAdmin();
  const [templates, users] = await Promise.all([
    db.inspectionTemplate.findMany({ orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, loginId: true } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">점검 템플릿·담당자</h1>
        <p className="text-sm text-slate-500">
          점검별 점검자와 승인자를 지정합니다. 승인 요청 전인 회차에도 바로 반영됩니다. 점검자와 승인자는 다른 사람이어야
          합니다.
        </p>
      </div>

      {templates.map((t) => {
        const s = parseSchema(t.schema);
        const items = s.sections.reduce((n, sec) => {
          if (sec.type === "checklist") return n + sec.groups.reduce((m, g) => m + g.items.length, 0);
          if (sec.type === "matrix") return n + sec.criteria.length;
          if (sec.type === "table") return n + (sec.rows?.length ?? 0);
          return n;
        }, 0);
        return (
          <section key={t.id} className="card px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">
                  {t.name} <span className="ml-1 font-mono text-xs font-normal text-slate-400">{t.code} v{t.version}</span>
                </h2>
                <p className="text-sm text-slate-600">{t.basis}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {FREQUENCY_LABEL[t.frequency as Frequency]} · 마감 기간 말일 · 섹션 {s.sections.length}개 · 항목 {items}개 · 증적{" "}
                  {s.evidenceSlots.length}종 · {periodLabel(t.startPeriod)}부터 회차 생성
                </p>
              </div>
            </div>
            <AssignRow
              templateId={t.id}
              users={users}
              inspectorLabel={s.roles.inspector}
              approverLabel={s.roles.approver}
              inspectorId={t.inspectorId}
              approverId={t.approverId}
            />
          </section>
        );
      })}
      <p className="text-xs text-slate-500">
        점검 항목 편집 화면은 4단계에서 제공합니다. 지금은 src/lib/templates의 정의 파일로 관리합니다.
      </p>
    </div>
  );
}
