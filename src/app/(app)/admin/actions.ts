"use server";

import { revalidatePath } from "next/cache";
import { autoLinkAssets } from "@/lib/asset-register";
import { audit } from "@/lib/audit";
import { hashPassword, passwordProblem, requireAdmin, requireUser, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export type Result = { ok?: boolean; error?: string; message?: string };

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ── 사용자 ────────────────────────────────────────

export async function createUser(_: Result | undefined, form: FormData): Promise<Result> {
  const admin = await requireAdmin();
  const loginId = str(form, "loginId");
  const name = str(form, "name");
  const email = str(form, "email") || null;
  const role = str(form, "role") === "ADMIN" ? "ADMIN" : "USER";
  const password = String(form.get("password") ?? "");
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(loginId)) return { error: "아이디는 영문·숫자 3~30자로 입력하세요." };
  if (!name) return { error: "이름을 입력하세요." };
  const problem = passwordProblem(password);
  if (problem) return { error: `초기 비밀번호: ${problem}` };
  if (await db.user.findUnique({ where: { loginId } })) return { error: "이미 있는 아이디입니다." };
  const u = await db.user.create({
    data: { loginId, name, email, role, passwordHash: await hashPassword(password) },
  });
  await audit({ id: admin.id, name: admin.name }, "user.created", { type: "user", id: u.id }, { loginId, role });
  revalidatePath("/admin/users");
  return { ok: true, message: `${name} 계정을 만들었습니다. 첫 로그인 때 2단계 인증을 등록합니다.` };
}

export async function updateUser(userId: string, patch: { role?: string; active?: boolean; email?: string }) {
  const admin = await requireAdmin();
  if (userId === admin.id && (patch.active === false || patch.role === "USER"))
    return { error: "본인 계정의 관리자 권한이나 사용 여부는 바꿀 수 없습니다." };
  await db.user.update({ where: { id: userId }, data: patch });
  if (patch.active === false) await db.session.deleteMany({ where: { userId } });
  await audit({ id: admin.id, name: admin.name }, "user.updated", { type: "user", id: userId }, patch);
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function unlockUser(userId: string) {
  const admin = await requireAdmin();
  await db.user.update({ where: { id: userId }, data: { lockedAt: null, failedLogins: 0 } });
  await audit({ id: admin.id, name: admin.name }, "user.unlocked", { type: "user", id: userId });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function resetPassword(userId: string, password: string): Promise<Result> {
  const admin = await requireAdmin();
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), lockedAt: null, failedLogins: 0 },
  });
  await db.session.deleteMany({ where: { userId } });
  await audit({ id: admin.id, name: admin.name }, "user.password_reset", { type: "user", id: userId });
  revalidatePath("/admin/users");
  return { ok: true, message: "비밀번호를 초기화했습니다." };
}

export async function resetTotp(userId: string) {
  const admin = await requireAdmin();
  await db.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecret: null } });
  await db.session.deleteMany({ where: { userId } });
  await audit({ id: admin.id, name: admin.name }, "user.totp_reset", { type: "user", id: userId });
  revalidatePath("/admin/users");
  return { ok: true };
}

// ── 템플릿 담당자 ─────────────────────────────────

export async function assignTemplate(templateId: string, inspectorId: string | null, approverId: string | null): Promise<Result> {
  const admin = await requireAdmin();
  if (inspectorId && inspectorId === approverId)
    return { error: "점검자와 승인자는 다른 사람이어야 합니다 (직무 분리)." };
  await db.inspectionTemplate.update({ where: { id: templateId }, data: { inspectorId, approverId } });
  // 아직 승인 요청 전인 회차에도 반영
  const updated = await db.inspectionRun.updateMany({
    where: { templateId, status: { in: ["PLANNED", "IN_PROGRESS", "REJECTED"] } },
    data: { inspectorId, approverId },
  });
  // 승인 요청 중인 회차는 승인자만 바꾼다 (승인자가 입력에 참여해 승인할 수 없는 경우 대비)
  const reassigned = await db.inspectionRun.updateMany({
    where: { templateId, status: "SUBMITTED" },
    data: { approverId },
  });
  await audit({ id: admin.id, name: admin.name }, "template.assigned", { type: "template", id: templateId }, {
    inspectorId,
    approverId,
    runsUpdated: updated.count,
    submittedReassigned: reassigned.count,
  });
  revalidatePath("/admin/templates");
  revalidatePath("/");
  return {
    ok: true,
    message: `저장했습니다. 진행 중인 회차 ${updated.count}건, 승인 대기 회차 ${reassigned.count}건(승인자만)에 반영했습니다.`,
  };
}

// ── 자산 ──────────────────────────────────────────

export async function createAsset(_: Result | undefined, form: FormData): Promise<Result> {
  const admin = await requireAdmin();
  const name = str(form, "name");
  const kind = str(form, "kind") || "SERVER";
  const tags = str(form, "tags");
  if (!name) return { error: "자산 이름을 입력하세요." };
  if (await db.asset.findUnique({ where: { name } })) return { error: "이미 있는 자산입니다." };
  const max = await db.asset.aggregate({ _max: { sortOrder: true } });
  const a = await db.asset.create({ data: { name, kind, tags, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  // 같은 이름의 자산관리대장 행이 있으면 연결
  const link = await autoLinkAssets();
  const linked = link.linked.find((l) => l.asset === name);
  await audit({ id: admin.id, name: admin.name }, "asset.created", { type: "asset", id: a.id }, {
    name,
    tags,
    ...(linked ? { linkedSheet: linked.sheet } : {}),
  });
  revalidatePath("/admin/assets");
  revalidatePath("/admin/asset-register");
  return {
    ok: true,
    message:
      `${name}을(를) 등록했습니다. 다음 회차부터 점검 대상에 들어갑니다.` +
      (linked ? ` 자산관리대장(${linked.sheet})과 연결했습니다.` : " 자산관리대장에 같은 이름이 없어 연결하지 않았습니다."),
  };
}

export async function updateAsset(assetId: string, patch: { active?: boolean; tags?: string }) {
  const admin = await requireAdmin();
  await db.asset.update({ where: { id: assetId }, data: patch });
  await audit({ id: admin.id, name: admin.name }, "asset.updated", { type: "asset", id: assetId }, patch);
  revalidatePath("/admin/assets");
  revalidatePath("/admin/asset-register");
  return { ok: true };
}

// ── 내 계정 ───────────────────────────────────────

export async function changeMyPassword(_: Result | undefined, form: FormData): Promise<Result> {
  const me = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(String(form.get("current") ?? ""), user.passwordHash)))
    return { error: "현재 비밀번호가 올바르지 않습니다." };
  const next = String(form.get("next") ?? "");
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next !== String(form.get("confirm") ?? "")) return { error: "새 비밀번호 확인이 일치하지 않습니다." };
  if (await verifyPassword(next, user.passwordHash)) return { error: "현재 비밀번호와 다른 비밀번호를 쓰세요." };
  await db.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next) } });
  await audit({ id: me.id, name: me.name }, "auth.password_changed", { type: "user", id: me.id });
  return { ok: true, message: "비밀번호를 바꿨습니다." };
}
