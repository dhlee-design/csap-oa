"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteRecord, moveRecord, saveRecord } from "@/app/(app)/admin/asset-register/actions";
import type { AssetColumn, AssetRow } from "@/lib/asset-register/workbook";
import { TargetCell } from "./AssetLink";

type Sheet = { id: string; name: string; title: string; category: string; description: string; columns: AssetColumn[] };
type Rec = { id: string; values: AssetRow; target: { name: string; active: boolean; tags: string } | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function AssetSheetEditor({ sheet, records }: { sheet: Sheet; records: Rec[] }) {
  const [editing, setEditing] = useState<{ id: string | null; values: AssetRow } | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cols = sheet.columns;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records.map((r, i) => ({ ...r, no: i + 1 }));
    return records
      .map((r, i) => ({ ...r, no: i + 1 }))
      .filter((r) => Object.values(r.values).some((v) => v.toLowerCase().includes(q)));
  }, [records, query]);

  const act = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else after?.();
    });

  return (
    <section className="space-y-3">
      <div className="card px-5 py-3 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold">{sheet.title}</h2>
          {sheet.category && <span className="text-slate-500">자산분류: {sheet.category}</span>}
        </div>
        {sheet.description && <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{sheet.description}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setEditing({ id: null, values: {} })}
          disabled={pending}
        >
          + 자산 추가
        </button>
        <input
          className="input input-sm w-56"
          placeholder="이 시트에서 찾기"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="text-xs text-slate-500">
          {query ? `${shown.length} / ${records.length}건` : `${records.length}건`}
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      {editing && (
        <RecordForm
          columns={cols}
          initial={editing.values}
          isNew={editing.id === null}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(values) => act(() => saveRecord(sheet.id, editing.id, values), () => setEditing(null))}
        />
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th w-12 whitespace-nowrap">
                <div className="h-3.5" />
                번호
              </th>
              {cols.map((c, i) => (
                <th key={c.col} className={`th whitespace-nowrap ${c.hidden ? "text-slate-400" : ""}`} title={`${c.col}열`}>
                  {/* 묶음 이름은 묶음이 시작되는 열에만 */}
                  <div className="h-3.5 text-[10px] font-normal text-slate-400">
                    {c.group && c.group !== cols[i - 1]?.group ? c.group : ""}
                  </div>
                  {c.label}
                  {c.hidden && <span className="ml-1 font-normal">(양식에서 숨김)</span>}
                </th>
              ))}
              <th className="th whitespace-nowrap" title="접근권한 점검 등 정기점검 대상 (대상 자산)">
                <div className="h-3.5" />
                점검 대상
              </th>
              <th className="th w-36 whitespace-nowrap">
                <div className="h-3.5" />
                관리
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={editing?.id === r.id ? "bg-brand-50" : "hover:bg-slate-50"}>
                <td className="td text-slate-500">{r.no}</td>
                {cols.map((c) => (
                  <td key={c.col} className={`td whitespace-pre ${c.hidden ? "text-slate-400" : ""}`}>
                    {r.values[c.col] ?? ""}
                  </td>
                ))}
                <td className="td whitespace-nowrap">
                  <TargetCell recordId={r.id} target={r.target} />
                </td>
                <td className="td whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending}
                      onClick={() => setEditing({ id: r.id, values: r.values })}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm px-1.5"
                      aria-label="위로"
                      title="위로"
                      disabled={pending || !!query || r.no === 1}
                      onClick={() => act(() => moveRecord(r.id, -1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm px-1.5"
                      aria-label="아래로"
                      title="아래로"
                      disabled={pending || !!query || r.no === records.length}
                      onClick={() => act(() => moveRecord(r.id, 1))}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm text-red-600"
                      disabled={pending}
                      onClick={() => {
                        const name = Object.values(r.values)[0] ?? `${r.no}번`;
                        const warn = r.target
                          ? `\n\n이 행은 점검 대상 '${r.target.name}'과(와) 연결되어 있습니다. 점검 대상은 그대로 남고 연결만 끊깁니다.`
                          : "";
                        if (confirm(`${name} 행을 삭제할까요? 삭제한 값은 감사 로그에 남습니다.${warn}`))
                          act(() => deleteRecord(r.id), () => editing?.id === r.id && setEditing(null));
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td className="td text-center text-slate-500" colSpan={cols.length + 3}>
                  {query ? "찾는 자산이 없습니다." : "등록된 자산이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecordForm({
  columns,
  initial,
  isNew,
  pending,
  onCancel,
  onSave,
}: {
  columns: AssetColumn[];
  initial: AssetRow;
  isNew: boolean;
  pending: boolean;
  onCancel: () => void;
  onSave: (values: AssetRow) => void;
}) {
  const [values, setValues] = useState<AssetRow>(initial);
  const set = (col: string, v: string) => setValues((s) => ({ ...s, [col]: v }));

  return (
    <form
      className="card space-y-3 border-brand-200 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(values);
      }}
    >
      <h3 className="font-semibold">{isNew ? "자산 추가" : "자산 수정"}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {columns.map((c) => {
          const v = values[c.col] ?? "";
          const id = `f-${c.col}`;
          return (
            <div key={c.col}>
              <label className="label" htmlFor={id}>
                {c.label}
                {c.group && <span className="ml-1 text-xs font-normal text-slate-400">{c.group}</span>}
                {c.hidden && <span className="ml-1 text-xs font-normal text-slate-400">(양식에서 숨김)</span>}
              </label>
              {c.type === "date" && (v === "" || DATE_RE.test(v)) ? (
                <input id={id} type="date" className="input" value={v} onChange={(e) => set(c.col, e.target.value)} />
              ) : (
                <textarea
                  id={id}
                  className="input min-h-9 resize-y"
                  rows={Math.max(1, v.split("\n").length)}
                  inputMode={c.type === "number" ? "decimal" : undefined}
                  value={v}
                  onChange={(e) => set(c.col, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">칸 안에서 줄을 바꾸면 엑셀에서도 같은 칸 안에서 줄이 바뀝니다.</p>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={pending}>
          취소
        </button>
      </div>
    </form>
  );
}
