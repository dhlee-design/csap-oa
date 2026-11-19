"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFile, MIME, storeEvidence } from "@/lib/evidence";
import { parseSchema, runParticipants } from "@/lib/runs";
import { EDITABLE_STATUSES } from "@/lib/status";
import { evaluate } from "@/lib/templates/engine";
import type { RunData } from "@/lib/templates/types";

export type ActionResult = { ok?: boolean; error?: string; errors?: string[] };

async function loadRun(id: string) {
  const run = await db.inspectionRun.findUnique({ where: { id }, include: { template: true } });
  if (!run) throw new Error("회차를 찾을 수 없습니다.");
  return run;
}

function canEdit(user: CurrentUser, run: { status: string; inspectorId: string | null; lockedAt: Date | null }) {
  if (run.lockedAt || !EDITABLE_STATUSES.includes(run.status)) return false;
  return user.role === "ADMIN" || run.inspectorId === user.id || run.inspectorId === null;
}

function changedKeys(before: RunData, after: RunData) {
  return Object.keys({ ...before, ...after }).filter(
    (k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null),
  );
}

export async function saveRun(id: string, data: RunData, inspectedAt: string | null): Promise<ActionResult> {
  const user = await requireUser();
  const run = await loadRun(id);
  if (!canEdit(user, run)) return { error: "이 회차를 수정할 권한이 없거나 잠긴 상태입니다." };

  const before = JSON.parse(run.data) as RunData;
  const changed = changedKeys(before, data);
  const date = inspectedAt ? new Date(inspectedAt) : null;
  await db.inspectionRun.update({
    where: { id },
    data: {
      data: JSON.stringify(data),
      inspectedAt: date,
      status: run.status === "PLANNED" ? "IN_PROGRESS" : run.status,
      inspectorId: run.inspectorId ?? user.id,
    },
  });
  if (changed.length || String(run.inspectedAt) !== String(date)) {
    await audit({ id: user.id, name: user.name }, "run.saved", { type: "run", id }, { sections: changed });
  }
  revalidatePath(`/runs/${id}`);
  return { ok: true };
}

export async function submitRun(id: string, data: RunData, inspectedAt: string | null): Promise<ActionResult> {
  const saved = await saveRun(id, data, inspectedAt);
  if (saved.error) return saved;

  const user = await requireUser();
  const run = await loadRun(id);
  if (!run.inspectedAt) return { errors: ["점검일을 입력하세요."] };
  if (!run.approverId) return { errors: ["승인자가 지정되지 않았습니다. 관리자에게 담당자 지정을 요청하세요."] };
  if (run.approverId === user.id)
    return { errors: ["점검자와 승인자가 같은 사람입니다. 직무 분리를 위해 다른 승인자를 지정하세요."] };

  const evidences = await db.evidence.findMany({ where: { runId: id, deletedAt: null }, select: { slotKey: true } });
  const schema = parseSchema(run.schema);
  const ev = evaluate(
    schema,
    data,
    { period: run.period, params: schema.params ?? {}, asOf: run.inspectedAt },
    new Set(evidences.map((e) => e.slotKey)),
  );
  if (ev.errors.length) return { errors: ev.errors };

  await db.$transaction([
    // 실제로 제출한 사람을 점검자로 기록한다
    db.inspectionRun.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date(), inspectorId: user.id } }),
    db.approval.create({ data: { runId: id, decision: "SUBMIT", actorId: user.id } }),
  ]);
  await audit({ id: user.id, name: user.name }, "run.submitted", { type: "run", id }, { findings: ev.findings.length });
  revalidatePath(`/runs/${id}`);
  return { ok: true };
}

async function decide(id: string, decision: "APPROVE" | "REJECT", comment: string): Promise<ActionResult> {
  const user = await requireUser();
  const run = await loadRun(id);
  if (run.status !== "SUBMITTED") return { error: "승인 요청 상태가 아닙니다." };
  const isApprover = run.approverId === user.id || user.role === "ADMIN";
  if (!isApprover) return { error: "이 회차의 승인자가 아닙니다." };
  if (run.inspectorId === user.id || (await runParticipants(id)).has(user.id))
    return { error: "본인이 입력·제출한 회차는 승인할 수 없습니다 (직무 분리)." };
  if (decision === "REJECT" && !comment.trim()) return { error: "반려 사유를 입력하세요." };

  const now = new Date();
  await db.$transaction([
    db.inspectionRun.update({
      where: { id },
      data:
        decision === "APPROVE"
          ? { status: "APPROVED", approvedAt: now, lockedAt: now, approverId: user.id }
          : { status: "REJECTED" },
    }),
    db.approval.create({ data: { runId: id, decision, comment: comment.trim() || null, actorId: user.id } }),
  ]);
  await audit(
    { id: user.id, name: user.name },
    decision === "APPROVE" ? "run.approved" : "run.rejected",
    { type: "run", id },
    { comment },
  );
  revalidatePath(`/runs/${id}`);
  return { ok: true };
}

export async function approveRun(id: string, comment: string) {
  return decide(id, "APPROVE", comment);
}

export async function rejectRun(id: string, comment: string) {
  return decide(id, "REJECT", comment);
}

/** 승인 완료 회차를 정정할 때: 원본은 보존하고 정정본을 새로 만든다 */
export async function createCorrection(id: string, reason: string): Promise<ActionResult> {
  const user = await requireUser();
  const run = await db.inspectionRun.findUnique({
    where: { id },
    include: { supersededBy: true, evidences: { where: { deletedAt: null } } },
  });
  if (!run) return { error: "회차를 찾을 수 없습니다." };
  if (run.status !== "APPROVED") return { error: "승인 완료된 회차만 정정할 수 있습니다." };
  if (run.supersededBy) return { error: "이미 정정본이 있습니다." };
  if (user.role !== "ADMIN" && run.inspectorId !== user.id) return { error: "정정 권한이 없습니다." };
  if (!reason.trim()) return { error: "정정 사유를 입력하세요." };

  const copy = await db.inspectionRun.create({
    data: {
      templateId: run.templateId,
      templateVersion: run.templateVersion,
      schema: run.schema,
      period: run.period,
      dueDate: run.dueDate,
      status: "IN_PROGRESS",
      data: run.data,
      inspectedAt: run.inspectedAt,
      inspectorId: run.inspectorId,
      approverId: run.approverId,
      revision: run.revision + 1,
      supersedesId: run.id,
      evidences: {
        create: run.evidences.map((e) => ({
          slotKey: e.slotKey,
          originalName: e.originalName,
          storedName: e.storedName,
          storagePath: e.storagePath,
          mimeType: e.mimeType,
          size: e.size,
          sha256: e.sha256,
          uploaderId: e.uploaderId,
          createdAt: e.createdAt,
        })),
      },
    },
  });
  await audit({ id: user.id, name: user.name }, "run.correction_created", { type: "run", id: copy.id }, {
    original: run.id,
    reason,
  });
  redirect(`/runs/${copy.id}`);
}

export async function uploadEvidence(id: string, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const run = await loadRun(id);
  if (!canEdit(user, run)) return { error: "이 회차에 증적을 올릴 권한이 없거나 잠긴 상태입니다." };
  const slotKey = String(form.get("slotKey") ?? "");
  const slot = parseSchema(run.schema).evidenceSlots.find((s) => s.key === slotKey);
  if (!slot) return { error: "증적 항목을 찾을 수 없습니다." };
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "파일을 선택하세요." };
  const problems = files.map(checkFile).filter(Boolean) as string[];
  if (problems.length) return { errors: problems };

  for (const file of files) {
    const stored = await storeEvidence({ file, period: run.period, runId: id, slotKey, slotTitle: slot.title });
    const ext = path.extname(file.name).toLowerCase();
    const ev = await db.evidence.create({
      data: {
        runId: id,
        slotKey,
        originalName: file.name,
        storedName: stored.storedName,
        storagePath: stored.storagePath,
        mimeType: MIME[ext] ?? file.type ?? "application/octet-stream",
        size: stored.size,
        sha256: stored.sha256,
        uploaderId: user.id,
      },
    });
    await audit({ id: user.id, name: user.name }, "evidence.uploaded", { type: "evidence", id: ev.id }, {
      runId: id,
      slotKey,
      name: file.name,
      sha256: stored.sha256,
    });
  }
  if (run.status === "PLANNED") await db.inspectionRun.update({ where: { id }, data: { status: "IN_PROGRESS" } });
  revalidatePath(`/runs/${id}`);
  return { ok: true };
}

export async function deleteEvidence(evidenceId: string): Promise<ActionResult> {
  const user = await requireUser();
  const ev = await db.evidence.findUnique({ where: { id: evidenceId }, include: { run: true } });
  if (!ev || ev.deletedAt) return { error: "증적을 찾을 수 없습니다." };
  if (!canEdit(user, ev.run)) return { error: "잠긴 회차의 증적은 삭제할 수 없습니다." };
  // 파일은 보존하고 기록만 삭제 표시한다
  await db.evidence.update({ where: { id: evidenceId }, data: { deletedAt: new Date() } });
  await audit({ id: user.id, name: user.name }, "evidence.deleted", { type: "evidence", id: evidenceId }, {
    runId: ev.runId,
    name: ev.originalName,
  });
  revalidatePath(`/runs/${ev.runId}`);
  return { ok: true };
}
