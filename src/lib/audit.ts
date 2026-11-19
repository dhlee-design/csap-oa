import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
  } catch {
    return null;
  }
}

export async function audit(
  actor: { id: string; name: string } | null,
  action: string,
  target?: { type: string; id: string },
  detail?: unknown,
) {
  await db.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      action,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      detail: detail === undefined ? null : JSON.stringify(detail),
      ip: await clientIp(),
    },
  });
}

export const AUDIT_LABEL: Record<string, string> = {
  "auth.login": "로그인",
  "auth.login_failed": "로그인 실패",
  "auth.locked": "계정 잠금",
  "auth.otp_failed": "2단계 인증 실패",
  "auth.totp_enabled": "2단계 인증 등록",
  "auth.logout": "로그아웃",
  "auth.password_changed": "비밀번호 변경",
  "setup.admin_created": "최초 관리자 생성",
  "user.created": "사용자 생성",
  "user.updated": "사용자 수정",
  "user.unlocked": "계정 잠금 해제",
  "user.password_reset": "비밀번호 초기화",
  "user.totp_reset": "2단계 인증 초기화",
  "template.assigned": "담당자 지정",
  "asset.created": "자산 등록",
  "asset.updated": "자산 수정",
  "asset.linked": "대상 자산 대장 연결",
  "asset.unlinked": "대상 자산 대장 연결 해제",
  "asset.auto_linked": "대상 자산 자동 연결",
  "asset_register.imported": "자산관리대장 양식 올리기",
  "asset_register.record_created": "자산관리대장 행 추가",
  "asset_register.record_updated": "자산관리대장 행 수정",
  "asset_register.record_deleted": "자산관리대장 행 삭제",
  "asset_register.record_moved": "자산관리대장 순서 변경",
  "asset_register.exported": "자산관리대장 다운로드",
  "asset_register.cloud_applied": "자산관리대장 클라우드 값 반영",
  "asset_register.cloud_added": "자산관리대장 클라우드 자산 추가",
  "ncloud.fetched": "네이버클라우드 자산 가져오기",
  "ncloud.fetch_failed": "네이버클라우드 가져오기 실패",
  "run.created": "회차 생성",
  "run.saved": "점검 내용 저장",
  "run.submitted": "승인 요청",
  "run.approved": "승인",
  "run.rejected": "반려",
  "run.correction_created": "정정본 생성",
  "evidence.uploaded": "증적 업로드",
  "evidence.deleted": "증적 삭제",
  "evidence.downloaded": "증적 다운로드",
};
