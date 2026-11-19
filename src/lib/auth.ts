import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { generateSecret, totpKeyUri, verifyTotpCode } from "./totp";

export const SESSION_COOKIE = "csap_session";
const SESSION_HOURS = 8;
export const MAX_FAILED_LOGINS = 5; // 접근통제관리지침 제4조 ⑥
export const TOTP_ISSUER = "CSAP 정기점검";

export type CurrentUser = {
  id: string;
  loginId: string;
  name: string;
  email: string | null;
  role: string;
  totpEnabled: boolean;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// ── 비밀번호 ──────────────────────────────────────

export function passwordProblem(pw: string): string | null {
  if (pw.length < 9) return "비밀번호는 9자 이상이어야 합니다.";
  const kinds = [/[a-zA-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(pw)).length;
  if (kinds < 3) return "영문, 숫자, 특수문자를 모두 포함해야 합니다.";
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// ── TOTP ──────────────────────────────────────────

export const newTotpSecret = () => generateSecret();
export const totpUri = (loginId: string, secret: string) => totpKeyUri(loginId, TOTP_ISSUER, secret);
export const verifyTotp = (token: string, secret: string) => verifyTotpCode(token, secret);

// ── 세션 ──────────────────────────────────────────

export async function createSession(userId: string, totpPassed: boolean) {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await db.session.create({
    data: {
      id: sha256(token),
      userId,
      totpPassed,
      expiresAt,
      ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
      userAgent: h.get("user-agent"),
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

async function readSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session;
}

export async function markSessionTotpPassed() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return;
  await db.session.update({ where: { id: sha256(token) }, data: { totpPassed: true } });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** 세션 원본 (2단계 인증 전 단계 포함) */
export const getPendingSession = cache(readSession);

function toCurrent(u: {
  id: string;
  loginId: string;
  name: string;
  email: string | null;
  role: string;
  totpEnabled: boolean;
}): CurrentUser {
  return {
    id: u.id,
    loginId: u.loginId,
    name: u.name,
    email: u.email,
    role: u.role,
    totpEnabled: u.totpEnabled,
  };
}

/** 2단계 인증까지 마친 사용자. 아니면 null */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await readSession();
  if (!s || !s.totpPassed) return null;
  return toCurrent(s.user);
});

/** 로그인 필수 화면에서 호출. 단계에 맞는 화면으로 보낸다. */
export async function requireUser(): Promise<CurrentUser> {
  // 레이아웃과 페이지가 동시에 렌더링되므로 여기서 회차 생성을 보장한다
  const { bootstrap } = await import("./runs");
  await bootstrap();
  const s = await getPendingSession();
  if (!s) redirect("/login");
  if (!s.totpPassed) redirect(s.user.totpEnabled ? "/login/otp" : "/login/totp-setup");
  return toCurrent(s.user);
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN") redirect("/");
  return u;
}
