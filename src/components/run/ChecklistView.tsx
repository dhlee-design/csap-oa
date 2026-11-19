"use client";

import type { ChecklistData, ChecklistSection } from "@/lib/templates/types";
import type { EvidenceItem } from "./EvidencePanel";

export function ChecklistView({
  section,
  value,
  onChange,
  disabled,
  evidences,
}: {
  section: ChecklistSection;
  value: ChecklistData | undefined;
  onChange: (v: ChecklistData) => void;
  disabled: boolean;
  evidences: EvidenceItem[];
}) {
  const data = value ?? {};
  const set = (key: string, patch: { result?: string; note?: string }) =>
    onChange({ ...data, [key]: { ...data[key], ...patch } });

  const allItems = section.groups.flatMap((g) => g.items);
  const fillAll = () => {
    const next = { ...data };
    for (const it of allItems) if (!next[it.key]?.result) next[it.key] = { ...next[it.key], result: section.resultOptions[0] };
    onChange(next);
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <h2 className="font-semibold">{section.title}</h2>
        {!disabled && (
          <button type="button" className="btn btn-sm" onClick={fillAll}>
            빈 항목 모두 &apos;{section.resultOptions[0]}&apos;
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th className="th w-40">구분</th>
              <th className="th">점검 항목</th>
              <th className="th w-28 text-center">결과</th>
              <th className="th w-56">비고</th>
            </tr>
          </thead>
          <tbody>
            {section.groups.map((g) =>
              g.items.map((it, i) => {
                const v = data[it.key] ?? {};
                const abnormal = v.result && section.abnormalValues.includes(v.result);
                const groupEvidence = evidences.filter((e) => g.evidenceSlots?.includes(e.slotKey));
                return (
                  <tr key={it.key} className={abnormal ? "bg-red-50" : ""}>
                    {i === 0 && (
                      <td className="td bg-slate-50/60 font-medium" rowSpan={g.items.length}>
                        {g.title}
                        {g.evidenceSlots?.length ? (
                          <div className="mt-1 text-[11px] font-normal">
                            {groupEvidence.length ? (
                              <span className="text-emerald-700">증적 {groupEvidence.length}건 첨부</span>
                            ) : (
                              <a href={`#slot-${g.evidenceSlots[0]}`} className="text-amber-700 underline">
                                증적 {g.evidenceSlots.join(", ")} 첨부 필요
                              </a>
                            )}
                          </div>
                        ) : null}
                      </td>
                    )}
                    <td className="td">{it.label}</td>
                    <td className="td">
                      <div className="flex justify-center gap-1" role="radiogroup" aria-label={it.label}>
                        {section.resultOptions.map((o) => {
                          const on = v.result === o;
                          const bad = section.abnormalValues.includes(o);
                          return (
                            <button
                              key={o}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              disabled={disabled}
                              onClick={() => set(it.key, { result: o })}
                              className={`h-8 w-10 rounded-md border text-sm font-semibold transition-colors disabled:cursor-default ${
                                on
                                  ? bad
                                    ? "border-red-600 bg-red-600 text-white"
                                    : "border-emerald-600 bg-emerald-600 text-white"
                                  : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                              }`}
                            >
                              {o}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="td">
                      <input
                        className="input input-sm"
                        value={v.note ?? ""}
                        disabled={disabled}
                        placeholder={abnormal ? "이상 내용을 적으세요" : ""}
                        onChange={(e) => set(it.key, { note: e.target.value })}
                      />
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
