import { computeValue, ROW_FACTORIES, type ComputeContext } from "./compute";
import type {
  ChecklistData,
  MatrixData,
  RunData,
  SummaryData,
  TableData,
  TableSection,
  TemplateSchema,
} from "./types";

/** 템플릿 원본 → 회차 스냅샷 (대상 자산, 기간별 행을 확정) */
export function instantiateSchema(
  schema: TemplateSchema,
  period: string,
  assetsByTag: Record<string, string[]>,
): TemplateSchema {
  const copy: TemplateSchema = structuredClone(schema);
  for (const s of copy.sections) {
    if (s.type === "matrix") s.targets = assetsByTag[s.targetTag] ?? [];
    if (s.type === "table" && s.rowFactory) s.rows = ROW_FACTORIES[s.rowFactory]?.(period) ?? [];
  }
  return copy;
}

export function initialData(schema: TemplateSchema): RunData {
  const data: RunData = {};
  for (const s of schema.sections) {
    if (s.type === "checklist" || s.type === "summary") data[s.key] = {};
    if (s.type === "matrix") data[s.key] = {};
    if (s.type === "table") {
      data[s.key] = {
        rows: (s.rows ?? []).map((r) => ({ key: r.key, values: {} })),
      } satisfies TableData;
    }
  }
  return data;
}

/** 고정 열 값 + 입력 값 + 계산 값을 합친 행 */
export function resolveRow(
  section: TableSection,
  rowKey: string,
  input: Record<string, string>,
  ctx: ComputeContext,
): Record<string, string> {
  const fixed = section.rows?.find((r) => r.key === rowKey)?.values ?? {};
  const merged: Record<string, string> = { ...fixed, ...input };
  for (const c of section.columns) {
    if (c.kind === "fixed") merged[c.key] = fixed[c.key] ?? "";
  }
  for (const c of section.columns) {
    if (c.kind === "computed") merged[c.key] = computeValue(c.compute, merged, ctx);
  }
  return merged;
}

export type Finding = { section: string; label: string; value: string };

export type Evaluation = {
  total: number;
  filled: number;
  /** 제출을 막는 오류 */
  errors: string[];
  /** 이상으로 판정된 항목 */
  findings: Finding[];
  missingEvidence: string[];
};

export function evaluate(
  schema: TemplateSchema,
  data: RunData,
  ctx: ComputeContext,
  evidenceSlotsFilled: Set<string>,
): Evaluation {
  let total = 0;
  let filled = 0;
  const errors: string[] = [];
  const findings: Finding[] = [];

  for (const s of schema.sections) {
    if (s.type === "checklist") {
      const d = (data[s.key] ?? {}) as ChecklistData;
      for (const g of s.groups) {
        for (const it of g.items) {
          total++;
          const v = d[it.key]?.result;
          if (v) filled++;
          else errors.push(`[${s.title}] "${it.label}" 결과 미입력`);
          if (v && s.abnormalValues.includes(v)) findings.push({ section: s.title, label: it.label, value: v });
        }
      }
    }

    if (s.type === "matrix") {
      const d = (data[s.key] ?? {}) as MatrixData;
      for (const t of s.targets ?? []) {
        for (const c of s.criteria) {
          total++;
          const cell = d[t]?.[c.key];
          if (cell?.result && cell?.detail) filled++;
          else errors.push(`[${t}] "${c.label}" 미입력`);
          if (cell?.result && cell.result !== s.resultOptions[0])
            findings.push({ section: t, label: c.label, value: cell.result });
          if (cell?.detail && s.abnormalDetails.includes(cell.detail))
            findings.push({ section: t, label: c.label, value: cell.detail });
        }
      }
    }

    if (s.type === "table") {
      const d = (data[s.key] ?? { rows: [] }) as TableData;
      const rows = d.rows ?? [];
      if (!s.optional && !s.rows?.length && rows.length < (s.minRows ?? 1)) {
        errors.push(`[${s.title}] 행을 1개 이상 입력하세요`);
      }
      rows.forEach((r, i) => {
        const merged = resolveRow(s, r.key, r.values, ctx);
        const rowName = merged[s.columns[0].key] || `${i + 1}행`;
        for (const c of s.columns) {
          if (c.kind === "fixed" || c.kind === "computed") {
            if (c.abnormalValues?.includes(merged[c.key]))
              findings.push({ section: s.title, label: `${rowName} · ${c.label}`, value: merged[c.key] });
            continue;
          }
          if (c.required) {
            total++;
            if (merged[c.key]) filled++;
            else errors.push(`[${s.title}] ${rowName}: "${c.label}" 미입력`);
          }
          if (merged[c.key] && c.abnormalValues?.includes(merged[c.key]))
            findings.push({ section: s.title, label: `${rowName} · ${c.label}`, value: merged[c.key] });
        }
      });
    }
  }

  // 종합: 이상 항목이 있으면 '이상 발견'과 조치 내용이 필요
  for (const s of schema.sections) {
    if (s.type !== "summary") continue;
    const d = (data[s.key] ?? {}) as SummaryData;
    total++;
    if (d.overall) filled++;
    else errors.push(`[${s.title}] 종합 결과 미선택`);
    if (findings.length > 0 && d.overall === "이상 없음") {
      errors.push(`[${s.title}] 이상 항목이 ${findings.length}건 있는데 종합 결과가 '이상 없음'입니다`);
    }
    if (d.overall === "이상 발견") {
      if (!d.issue?.trim()) errors.push(`[${s.title}] 이상 내용을 입력하세요`);
      if (!d.action?.trim()) errors.push(`[${s.title}] 조치 사항을 입력하세요`);
      if (!d.actionStatus) errors.push(`[${s.title}] 조치 완료 여부를 선택하세요`);
    }
  }

  const missingEvidence = schema.evidenceSlots
    .filter((e) => e.required && !evidenceSlotsFilled.has(e.key))
    .map((e) => `${e.key} ${e.title}`);
  for (const m of missingEvidence) errors.push(`[증적] ${m} 파일 미첨부`);

  return { total, filled, errors, findings, missingEvidence };
}
