"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import {
  createSession,
  destroySession,
  getPendingSession,
  hashPassword,
  markSessionTotpPassed,
  MAX_FAILED_LOGINS,
  passwordProblem,
  verifyPassword,
  verifyTotp,
} from "@/lib/auth";
import { db } from "@/lib/db";

export type FormState = { error?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function setupAdmin(_: FormState, form: FormData): Promise<FormState> {
  if ((await db.user.count()) > 0) redirect("/login");
  const loginId = str(form, "loginId");
  const name = str(form, "name");
  const email = str(form, "email") || null;
  const password = String(form.get("password") ?? "");
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(loginId)) return { error: "아이디는 영문·숫자 3~30자로 입력하세요." };
  if (!name) return { error: "이름을 입력하세요." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== String(form.get("confirm") ?? "")) return { error: "비밀번호 확인이 일치하지 않습니다." };

  const user = await db.user.create({
    data: { loginId, name, email, role: "ADMIN", passwordHash: await hashPassword(password) },
  });
  await audit({ id: user.id, name: user.name }, "setup.admin_created", { type: "user", id: user.id });
  await createSession(user.id, false);
  redirect("/login/totp-setup");
}

async function registerFailure(user: { id: string; name: string; failedLogins: number }, action: string) {
  const failed = user.failedLogins + 1;
  const lock = failed >= MAX_FAILED_LOGINS;
  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: failed, lockedAt: lock ? new Date() : undefined },
  });
  await audit({ id: user.id, name: user.name }, action, { type: "user", id: user.id }, { failed });
  if (lock) {
    await audit({ id: user.id, name: user.name }, "auth.locked", { type: "user", id: user.id });
    return `${MAX_FAILED_LOGINS}회 실패하여 계정이 잠겼습니다. 관리자에게 잠금 해제를 요청하세요.`;
  }
  return null;
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const loginId = str(form, "loginId");
  const password = String(form.get("password") ?? "");
  const user = await db.user.findUnique({ where: { loginId } });
  const generic = "아이디 또는 비밀번호가 올바르지 않습니다.";
  if (!user || !user.active) {
    await audit(null, "auth.login_failed", undefined, { loginId });
    return { error: generic };
  }
  if (user.lockedAt) return { error: "잠긴 계정입니다. 관리자에게 잠금 해제를 요청하세요." };
  if (!(await verifyPassword(password, user.passwordHash))) {
    const locked = await registerFailure(user, "auth.login_failed");
    return { error: locked ?? `${generic} (${user.failedLogins + 1}/${MAX_FAILED_LOGINS})` };
  }
  await createSession(user.id, false);
  redirect(user.totpEnabled ? "/login/otp" : "/login/totp-setup");
}

export async function verifyOtp(_: FormState, form: FormData): Promise<FormState> {
  const s = await getPendingSession();
  if (!s) redirect("/login");
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId } });
  if (user.lockedAt) {
    await destroySession();
    redirect("/login");
  }
  if (!user.totpSecret || !verifyTotp(str(form, "code"), user.totpSecret)) {
    const locked = await registerFailure(user, "auth.otp_failed");
    if (locked) {
      // 세션을 지우면 이 화면은 /login으로 넘어가 오류 문구가 사라지므로, 잠금 안내를 쿼리로 넘긴다
      await destroySession();
      redirect("/login?locked=1");
    }
    return { error: `인증 코드가 올바르지 않습니다. (${user.failedLogins + 1}/${MAX_FAILED_LOGINS})` };
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lastLoginAt: new Date() } });
  await markSessionTotpPassed();
  await audit({ id: user.id, name: user.name }, "auth.login", { type: "user", id: user.id });
  redirect("/");
}

export async function enableTotp(_: FormState, form: FormData): Promise<FormState> {
  const s = await getPendingSession();
  if (!s) redirect("/login");
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId } });
  if (user.totpEnabled) redirect("/login/otp");
  if (user.lockedAt) {
    await destroySession();
    redirect("/login");
  }
  if (!user.totpSecret || !verifyTotp(str(form, "code"), user.totpSecret)) {
    // 등록 단계의 실패도 로그인 실패와 같이 기록하고 5회 잠금에 포함한다
    const locked = await registerFailure(user, "auth.otp_failed");
    if (locked) {
      await destroySession();
      redirect("/login?locked=1");
    }
    return {
      error: `인증 코드가 올바르지 않습니다. 앱에 표시된 6자리 숫자를 입력하세요. (${user.failedLogins + 1}/${MAX_FAILED_LOGINS})`,
    };
  }
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, failedLogins: 0, lastLoginAt: new Date() },
  });
  await markSessionTotpPassed();
  await audit({ id: user.id, name: user.name }, "auth.totp_enabled", { type: "user", id: user.id });
  await audit({ id: user.id, name: user.name }, "auth.login", { type: "user", id: user.id });
  redirect("/");
}

export async function logout() {
  const s = await getPendingSession();
  if (s) await audit({ id: s.user.id, name: s.user.name }, "auth.logout", { type: "user", id: s.user.id });
  await destroySession();
  redirect("/login");
}
