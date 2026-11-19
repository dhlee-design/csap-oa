import "server-only";
import { db } from "./db";
export { STATUS_LABEL, isOverdue } from "./status";
import { dueDateOf, periodOf, periodsUntil } from "./period";
import { initialData, instantiateSchema } from "./templates/engine";
import { BUILTIN_ASSETS, BUILTIN_TEMPLATES } from "./templates";
import type { Frequency, RunData, TemplateSchema } from "./templates/types";

export const parseSchema = (s: string) => JSON.parse(s) as TemplateSchema;
export const parseData = (s: string) => JSON.parse(s) as RunData;

/** 기본 템플릿과 자산이 없으면 등록한다 */
async function ensureSeed() {
  for (const [i, t] of BUILTIN_TEMPLATES.entries()) {
    const exists = await db.inspectionTemplate.findUnique({ where: { code: t.code } });
    if (exists) continue;
    await db.inspectionTemplate.create({
      data: {
        code: t.code,
        name: t.name,
        basis: t.basis,
        frequency: t.frequency,
        schema: JSON.stringify(t),
        startPeriod: periodOf(t.frequency, new Date()),
        sortOrder: i,
      },
    });
  }
  if ((await db.asset.count()) === 0) {
    await db.asset.createMany({
      data: BUILTIN_ASSETS.map((a, i) => ({ ...a, sortOrder: i })),
    });
  }
}

async function assetsByTag(): Promise<Record<string, string[]>> {
  const assets = await db.asset.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const out: Record<string, string[]> = {};
  for (const a of assets) {
    for (const tag of a.tags.split(",").map((t) => t.trim()).filter(Boolean)) {
      (out[tag] ??= []).push(a.name);
    }
  }
  return out;
}

/** 시작 기간부터 현재 기간까지 빠진 회차를 만든다 (PC가 꺼져 있던 기간 포함) */
export async function ensureRuns(now = new Date()) {
  const templates = await db.inspectionTemplate.findMany({ where: { active: true } });
  const tags = await assetsByTag();
  let created = 0;
  for (const t of templates) {
    const periods = periodsUntil(t.frequency as Frequency, t.startPeriod, now);
    const existing = new Set(
      (await db.inspectionRun.findMany({ where: { templateId: t.id }, select: { period: true } })).map(
        (r) => r.period,
      ),
    );
    for (const period of periods) {
      if (existing.has(period)) continue;
      const schema = instantiateSchema(parseSchema(t.schema), period, tags);
      const run = await db.inspectionRun.create({
        data: {
          templateId: t.id,
          templateVersion: t.version,
          schema: JSON.stringify(schema),
          period,
          dueDate: dueDateOf(period),
          data: JSON.stringify(initialData(schema)),
          inspectorId: t.inspectorId,
          approverId: t.approverId,
        },
      });
      await db.auditLog.create({
        data: { action: "run.created", targetType: "run", targetId: run.id, detail: JSON.stringify({ period }) },
      });
      created++;
    }
  }
  return created;
}

let lastBootstrap = 0;
let inflight: Promise<void> | null = null;

/** 시드·회차 생성. 최대 10분에 한 번 실행하고, 동시에 호출되면 같은 작업을 기다린다. */
export function bootstrap(): Promise<void> {
  if (inflight) return inflight;
  if (Date.now() - lastBootstrap < 10 * 60 * 1000) return Promise.resolve();
  inflight = (async () => {
    try {
      await ensureSeed();
      await ensureRuns();
      lastBootstrap = Date.now();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 회차를 입력·제출·증적 업로드한 사용자 (직무 분리: 이 사람들은 승인할 수 없다) */
export async function runParticipants(runId: string): Promise<Set<string>> {
  const [logs, subs, evs] = await Promise.all([
    db.auditLog.findMany({
      where: { targetType: "run", targetId: runId, action: { in: ["run.saved", "run.submitted"] } },
      select: { actorId: true },
    }),
    db.approval.findMany({ where: { runId, decision: "SUBMIT" }, select: { actorId: true } }),
    db.evidence.findMany({ where: { runId }, select: { uploaderId: true } }),
  ]);
  const ids = [...logs.map((l) => l.actorId), ...subs.map((s) => s.actorId), ...evs.map((e) => e.uploaderId)];
  return new Set(ids.filter((x): x is string => !!x));
}
