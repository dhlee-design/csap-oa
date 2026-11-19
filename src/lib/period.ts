import type { Frequency } from "./templates/types";

// 기간 문자열: MONTHLY "2026-11" | QUARTERLY "2026-Q4" | HALF "2026-H2" | YEARLY "2026"

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  MONTHLY: "월 1회",
  QUARTERLY: "분기 1회",
  HALF: "반기 1회",
  YEARLY: "연 1회",
};

export function periodOf(freq: Frequency, d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  switch (freq) {
    case "MONTHLY":
      return `${y}-${String(m).padStart(2, "0")}`;
    case "QUARTERLY":
      return `${y}-Q${Math.ceil(m / 3)}`;
    case "HALF":
      return `${y}-H${m <= 6 ? 1 : 2}`;
    case "YEARLY":
      return `${y}`;
  }
}

/** 기간의 [시작월, 끝월] (1~12) */
function monthRange(period: string): { year: number; from: number; to: number } {
  const [ys, part] = period.split("-");
  const year = Number(ys);
  if (!part) return { year, from: 1, to: 12 };
  if (part.startsWith("Q")) {
    const q = Number(part.slice(1));
    return { year, from: q * 3 - 2, to: q * 3 };
  }
  if (part.startsWith("H")) {
    const h = Number(part.slice(1));
    return { year, from: h === 1 ? 1 : 7, to: h === 1 ? 6 : 12 };
  }
  const m = Number(part);
  return { year, from: m, to: m };
}

export function periodStart(period: string): Date {
  const { year, from } = monthRange(period);
  return new Date(year, from - 1, 1);
}

/** 마감일 = 기간의 말일 23:59:59 (로컬 시간) */
export function dueDateOf(period: string): Date {
  const { year, to } = monthRange(period);
  return new Date(year, to, 0, 23, 59, 59);
}

export function nextPeriod(freq: Frequency, period: string): string {
  const { year, to } = monthRange(period);
  return periodOf(freq, new Date(year, to, 1));
}

/** start 기간부터 now가 속한 기간까지 (포함) */
export function periodsUntil(freq: Frequency, start: string, now: Date): string[] {
  const out: string[] = [];
  const last = periodOf(freq, now);
  let p = start;
  for (let i = 0; i < 1000; i++) {
    out.push(p);
    if (p === last) break;
    if (periodStart(p) > now) break;
    p = nextPeriod(freq, p);
  }
  return out;
}

export function daysInMonth(period: string): number {
  const { year, to } = monthRange(period);
  return new Date(year, to, 0).getDate();
}

export function periodLabel(period: string): string {
  const [y, part] = period.split("-");
  if (!part) return `${y}년`;
  if (part.startsWith("Q")) return `${y}년 ${part.slice(1)}분기`;
  if (part.startsWith("H")) return `${y}년 ${part === "H1" ? "상반기" : "하반기"}`;
  return `${y}년 ${Number(part)}월`;
}

/** 최근 n개월의 월 기간 목록 (오래된 것부터) */
export function recentMonths(n: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(periodOf("MONTHLY", new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

/** 월 기간이 어떤 템플릿 기간에 포함되는지 */
export function monthInPeriod(month: string, period: string): boolean {
  const { year, from, to } = monthRange(period);
  const [my, mm] = month.split("-").map(Number);
  return my === year && mm >= from && mm <= to;
}
