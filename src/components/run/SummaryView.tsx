"use client";

import type { Finding } from "@/lib/templates/engine";
import type { SummaryData, SummarySection } from "@/lib/templates/types";

export function SummaryView({
  section,
  value,
  onChange,
  disabled,
  findings,
}: {
  section: SummarySection;
  value: SummaryData | undefined;
  onChange: (v: SummaryData) => void;
  disabled: boolean;
  findings: Finding[];
}) {
  const d = value ?? {};
  const set = (patch: Partial<SummaryData>) => onChange({ ...d, ...patch });
  const abnormal = d.overall === "이상 발견";

  return (
    <section className="card px-5 py-4">
      <h2 className="mb-3 font-semibold">{section.title}</h2>

      {findings.length > 0 && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <div className="font-medium">이상 항목 {findings.length}건</div>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {findings.slice(0, 10).map((f, i) => (
              <li key={i}>
                [{f.section}] {f.label} → <b>{f.value}</b>
              </li>
            ))}
            {findings.length > 10 && <li>외 {findings.length - 10}건</li>}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="font-medium">종합 결과</span>
          {(["이상 없음", "이상 발견"] as const).map((o) => (
            <label key={o} className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`${section.key}-overall`}
                checked={d.overall === o}
                disabled={disabled}
                onChange={() => set({ overall: o })}
              />
              {o}
            </label>
          ))}
        </div>

        {abnormal && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">이상 내용</label>
              <textarea
                className="input min-h-20"
                value={d.issue ?? ""}
                disabled={disabled}
                onChange={(e) => set({ issue: e.target.value })}
              />
            </div>
            <div>
              <label className="label">조치 사항</label>
              <textarea
                className="input min-h-20"
                value={d.action ?? ""}
                disabled={disabled}
                onChange={(e) => set({ action: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium">조치 완료 여부</span>
              {(["완료", "진행 중"] as const).map((o) => (
                <label key={o} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`${section.key}-status`}
                    checked={d.actionStatus === o}
                    disabled={disabled}
                    onChange={() => set({ actionStatus: o })}
                  />
                  {o}
                </label>
              ))}
            </div>
          </div>
        )}

        {section.withOpinion && (
          <div>
            <label className="label">종합 의견</label>
            <textarea
              className="input min-h-16"
              value={d.opinion ?? ""}
              disabled={disabled}
              onChange={(e) => set({ opinion: e.target.value })}
            />
          </div>
        )}
      </div>
    </section>
  );
}
