"use client";

import { useState, useTransition } from "react";
import { resetPassword, resetTotp, unlockUser, updateUser } from "@/app/(app)/admin/actions";

export function UserRowActions(props: {
  userId: string;
  isSelf: boolean;
  role: string;
  active: boolean;
  locked: boolean;
  totpEnabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ?? r.message ?? null);
    });

  return (
    <div className="flex flex-wrap gap-1.5">
      {props.locked && (
        <button className="btn btn-sm" disabled={pending} onClick={() => act(() => unlockUser(props.userId))}>
          잠금 해제
        </button>
      )}
      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={() => {
          const pw = prompt("새 비밀번호 (9자 이상, 영문·숫자·특수문자)");
          if (pw) act(() => resetPassword(props.userId, pw));
        }}
      >
        비밀번호 초기화
      </button>
      {props.totpEnabled && (
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() => {
            if (confirm("2단계 인증을 초기화하면 다음 로그인 때 다시 등록해야 합니다. 계속할까요?"))
              act(() => resetTotp(props.userId));
          }}
        >
          2단계 인증 초기화
        </button>
      )}
      {!props.isSelf && (
        <>
          <button
            className="btn btn-sm"
            disabled={pending}
            onClick={() => act(() => updateUser(props.userId, { role: props.role === "ADMIN" ? "USER" : "ADMIN" }))}
          >
            {props.role === "ADMIN" ? "사용자로 변경" : "관리자로 변경"}
          </button>
          <button
            className="btn btn-sm"
            disabled={pending}
            onClick={() => act(() => updateUser(props.userId, { active: !props.active }))}
          >
            {props.active ? "사용 중지" : "사용 재개"}
          </button>
        </>
      )}
      {msg && <span className="w-full text-xs text-slate-600">{msg}</span>}
    </div>
  );
}
