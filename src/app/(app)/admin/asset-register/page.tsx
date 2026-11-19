import Link from "next/link";
import { AssetSheetEditor } from "@/components/admin/AssetSheetEditor";
import { TemplateUpload } from "@/components/admin/AssetTemplateUpload";
import { parseColumns, parseValues, templateMeta } from "@/lib/asset-register";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/status";

export default async function AssetRegisterPage({ searchParams }: { searchParams: Promise<{ sheet?: string }> }) {
  await requireAdmin();
  const { sheet: sheetParam } = await searchParams;
  const [meta, sheets] = await Promise.all([
    templateMeta(),
    db.assetSheet.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { records: true } } } }),
  ]);
  const current = sheets.find((s) => s.id === sheetParam) ?? sheets[0];
  const records = current
    ? await db.assetRecord.findMany({
        where: { sheetId: current.id },
        orderBy: { sortOrder: "asc" },
        include: { target: { select: { name: true, active: true, tags: true } } },
      })
    : [];
  const total = sheets.reduce((n, s) => n + s._count.records, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">자산관리대장</h1>
          <p className="text-sm text-slate-500">
            STEG_CSAP_041 자산관리대장을 관리합니다. 다운로드하면 올린 양식 파일과 같은 형식(표지·시트·머리글·서식)에 현재
            값이 채워집니다.
          </p>
        </div>
        {meta && sheets.length > 0 && (
          <a href="/api/asset-register" className="btn btn-primary">
            양식 그대로 다운로드 (.xlsx)
          </a>
        )}
      </div>

      <section className="card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-sm">
            <h2 className="font-semibold">양식 파일</h2>
            {meta ? (
              <p className="mt-1 text-slate-600">
                {meta.originalName} · {Math.ceil(meta.size / 1024)}KB · {meta.uploadedBy} ·{" "}
                {formatDate(new Date(meta.uploadedAt), true)} · 시트 {sheets.length}개 · 자산 {total}건
              </p>
            ) : (
              <p className="mt-1 text-amber-700">
                아직 양식이 없습니다. 자산관리대장 xlsx 파일을 올리면 시트별 열 구성과 현재 자산이 등록됩니다.
              </p>
            )}
          </div>
          <TemplateUpload hasData={sheets.length > 0} />
        </div>
      </section>

      {current && (
        <>
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="시트">
            {sheets.map((s) => (
              <Link
                key={s.id}
                href={`?sheet=${s.id}`}
                className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
                  s.id === current.id
                    ? "border-brand-600 font-semibold text-brand-700"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {s.name} <span className="text-xs text-slate-400">{s._count.records}</span>
              </Link>
            ))}
          </nav>

          <AssetSheetEditor
            key={current.id}
            sheet={{
              id: current.id,
              name: current.name,
              title: current.title,
              category: current.category,
              description: current.description,
              columns: parseColumns(current.columns),
            }}
            records={records.map((r) => ({ id: r.id, values: parseValues(r.values), target: r.target }))}
          />
        </>
      )}
    </div>
  );
}
