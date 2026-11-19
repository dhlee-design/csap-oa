import { daysInMonth } from "../period";
import type { TableRow } from "./types";

export type ComputeContext = {
  period: string;
  params: Record<string, number | string>;
  /** 계산 기준 시각 (점검일 또는 현재) */
  asOf: Date;
};

type ComputeFn = (row: Record<string, string>, ctx: ComputeContext) => string;

const DAY = 24 * 60 * 60 * 1000;

function parseDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const COMPUTE: Record<string, ComputeFn> = {
  retainedDays(row, ctx) {
    const oldest = parseDate(row.oldestBackup);
    if (!oldest) return "";
    return String(Math.floor((ctx.asOf.getTime() - oldest.getTime()) / DAY));
  },
  retentionOk(row, ctx) {
    const oldest = parseDate(row.oldestBackup);
    if (!oldest) return "";
    const days = Math.floor((ctx.asOf.getTime() - oldest.getTime()) / DAY);
    const need = Number(ctx.params.retentionDays ?? 180);
    return days >= need ? "충족" : "미충족";
  },
  complianceRate(row) {
    const planned = Number(row.planned);
    const success = Number(row.success);
    if (!row.success || !planned) return "";
    return `${((success / planned) * 100).toFixed(1)}%`;
  },
  complianceVerdict(row, ctx) {
    const planned = Number(row.planned);
    const success = Number(row.success);
    if (!row.success || !planned) return "";
    const target = Number(ctx.params.complianceTarget ?? 0.99);
    return success / planned >= target ? "충족" : "미달";
  },
  duration(row) {
    const s = parseDate(row.startedAt);
    const f = parseDate(row.finishedAt);
    if (!s || !f || f < s) return "";
    const min = Math.round((f.getTime() - s.getTime()) / 60000);
    return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`;
  },
};

export function computeValue(name: string | undefined, row: Record<string, string>, ctx: ComputeContext) {
  if (!name || !COMPUTE[name]) return "";
  return COMPUTE[name](row, ctx);
}

// 기간에 따라 고정 행을 만드는 함수
export const ROW_FACTORIES: Record<string, (period: string) => TableRow[]> = {
  monthlyCompliance(period) {
    const days = String(daysInMonth(period));
    return [
      { key: "db", values: { kind: "DB 일 백업", planned: days } },
      { key: "offsite", values: { kind: "소산 백업", planned: days } },
    ];
  },
};
