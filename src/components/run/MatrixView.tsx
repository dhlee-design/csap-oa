"use client";

import { useState } from "react";
import type { MatrixData, MatrixSection } from "@/lib/templates/types";

export function MatrixView({
  section,
  value,
  onChange,
  disabled,
}: {
  section: MatrixSection;
  value: MatrixData | undefined;
  onChange: (v: MatrixData) => void;
  disabled: boolean;
}) {
  const data = value ?? {};
  const targets = section.targets ?? [];
  const [open, setOpen] = useState<string | null>(targets[0] ?? null);
  const listId = `${section.key}-details`;

  const setCell = (t: string, c: string, patch: { result?: string; detail?: string }) =>
    onChange({ ...data, [t]: { ...data[t], [c]: { ...data[t]?.[c], ...patch } } });

  const fill = (only?: string) => {
    const next: MatrixData = structuredClone(data);
    for (const t of only ? [only] : targets) {
      next[t] ??= {};
      for (const c of section.criteria) {
        const cell = next[t][c.key] ?? {};
        next[t][c.key] = {
          result: cell.result || section.resultOptions[0],
          detail: cell.detail || section.detailOptions[0],
        };
      }
    }
    onChange(next);
  };

  const doneCount = (t: string) =>
    section.criteria.filter((c) => data[t]?.[c.key]?.result && data[t]?.[c.key]?.detail).length;
  const hasIssue = (t: string) =>
    section.criteria.some((c) => {
      const cell = data[t]?.[c.key];
      return (
        (cell?.result && cell.result !== section.resultOptions[0]) ||
        (cell?.detail && section.abnormalDetails.includes(cell.detail))
      );
    });

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <div>
          <h2 className="font-semibold">{section.title}</h2>
          {section.description && <p className="text-xs text-slate-500">{section.description}</p>}
        </div>
        {!disabled && (
          <button type="button" className="btn btn-sm" onClick={() => fill()}>
            빈 칸 모두 &apos;{section.resultOptions[0]} / {section.detailOptions[0]}&apos;
          </button>
        )}
      </div>
      <datalist id={listId}>
        {section.detailOptions.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      {targets.length === 0 && (
        <p className="px-5 pb-5 text-sm text-amber-700">
          점검 대상 자산이 없습니다. 관리 &gt; 대상 자산에서 &apos;{section.targetTag}&apos; 태그를 지정하세요.
        </p>
      )}

      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {targets.map((t) => {
          const done = doneCount(t);
          const issue = hasIssue(t);
          const isOpen = open === t;
          return (
            <div key={t}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : t)}
                className="flex w-full items-center justify-between px-5 py-2.5 text-left hover:bg-slate-50"
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
                  {t}
                  {issue && <span className="badge bg-red-50 text-red-700">이상</span>}
                </span>
                <span
                  className={`text-xs ${done === section.criteria.length ? "text-emerald-700" : "text-slate-500"}`}
                >
                  {done}/{section.criteria.length}
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-4">
                  {!disabled && (
                    <div className="mb-2 text-right">
                      <button type="button" className="btn btn-sm" onClick={() => fill(t)}>
                        이 시스템 빈 칸 채우기
                      </button>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr>
                          <th className="th w-10">No</th>
                          <th className="th">점검 기준</th>
                          <th className="th w-32">점검 결과</th>
                          <th className="th w-52">결과 상세</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.criteria.map((c, i) => {
                          const cell = data[t]?.[c.key] ?? {};
                          const bad = cell.detail && section.abnormalDetails.includes(cell.detail);
                          return (
                            <tr key={c.key} className={bad ? "bg-red-50" : ""}>
                              <td className="td text-slate-500">{i + 1}</td>
                              <td className="td">{c.label}</td>
                              <td className="td">
                                <select
                                  className="input input-sm"
                                  value={cell.result ?? ""}
                                  disabled={disabled}
                                  onChange={(e) => setCell(t, c.key, { result: e.target.value })}
                                >
                                  <option value="">선택</option>
                                  {section.resultOptions.map((o) => (
                                    <option key={o}>{o}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="td">
                                <input
                                  className="input input-sm"
                                  list={listId}
                                  value={cell.detail ?? ""}
                                  disabled={disabled}
                                  placeholder="선택하거나 직접 입력"
                                  onChange={(e) => setCell(t, c.key, { detail: e.target.value })}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
