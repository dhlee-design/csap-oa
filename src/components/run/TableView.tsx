"use client";

import type { ComputeContext } from "@/lib/templates/compute";
import { resolveRow } from "@/lib/templates/engine";
import type { Column, TableData, TableSection } from "@/lib/templates/types";

export function TableView({
  section,
  value,
  onChange,
  disabled,
  ctx,
}: {
  section: TableSection;
  value: TableData | undefined;
  onChange: (v: TableData) => void;
  disabled: boolean;
  ctx: ComputeContext;
}) {
  const rows = value?.rows ?? [];
  const fixedRows = !!section.rows?.length;

  const setCell = (i: number, key: string, v: string) =>
    onChange({ rows: rows.map((r, j) => (j === i ? { ...r, values: { ...r.values, [key]: v } } : r)) });
  const addRow = () => onChange({ rows: [...rows, { key: `r${Date.now()}`, values: {} }] });
  const removeRow = (i: number) => onChange({ rows: rows.filter((_, j) => j !== i) });

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <div>
          <h2 className="font-semibold">
            {section.title}
            {section.optional && <span className="ml-2 text-xs font-normal text-slate-500">(해당 시 입력)</span>}
          </h2>
          {section.description && <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>}
        </div>
        {!fixedRows && !disabled && (
          <button type="button" className="btn btn-sm" onClick={addRow}>
            + 행 추가
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: `${Math.max(640, section.columns.length * 130)}px` }}>
          <thead>
            <tr>
              <th className="th w-10">No</th>
              {section.columns.map((c) => (
                <th key={c.key} className="th" style={c.width ? { minWidth: c.width } : undefined}>
                  {c.label}
                  {c.required && <span className="text-red-500"> *</span>}
                </th>
              ))}
              {!fixedRows && !disabled && <th className="th w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={section.columns.length + 2}>
                  {section.optional ? "이번 회차에 수행하지 않았으면 비워 두세요." : "행을 추가하세요."}
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const merged = resolveRow(section, r.key, r.values, ctx);
              return (
                <tr key={r.key}>
                  <td className="td text-slate-500">{i + 1}</td>
                  {section.columns.map((c) => (
                    <td key={c.key} className="td">
                      <Cell column={c} value={merged[c.key] ?? ""} disabled={disabled} onChange={(v) => setCell(i, c.key, v)} />
                    </td>
                  ))}
                  {!fixedRows && !disabled && (
                    <td className="td">
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => removeRow(i)}
                        aria-label={`${i + 1}행 삭제`}
                      >
                        삭제
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({
  column: c,
  value,
  disabled,
  onChange,
}: {
  column: Column;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const bad = !!value && c.abnormalValues?.includes(value);
  if (c.kind === "fixed") return <span className="text-sm text-slate-700">{value || "-"}</span>;
  if (c.kind === "computed")
    return (
      <span className={`text-sm font-medium ${bad ? "text-red-600" : value ? "text-emerald-700" : "text-slate-400"}`}>
        {value || "자동"}
      </span>
    );
  const cls = `input input-sm ${bad ? "border-red-400 bg-red-50" : ""}`;
  if (c.kind === "select")
    return (
      <select className={cls} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">선택</option>
        {c.options?.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  if (c.kind === "textarea")
    return (
      <textarea
        className={`${cls} min-h-8`}
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  const type = c.kind === "datetime" ? "datetime-local" : c.kind === "date" ? "date" : c.kind === "number" ? "number" : "text";
  return (
    <input
      className={cls}
      type={type}
      min={c.kind === "number" ? 0 : undefined}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
