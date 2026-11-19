"use client";

import { useActionState } from "react";

type R = { ok?: boolean; error?: string; message?: string } | undefined;

/** 서버 액션 폼 + 결과 메시지 */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
}: {
  action: (s: R, f: FormData) => Promise<R>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(async (s: R, f: FormData) => action(s, f), undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "처리 중…" : submitLabel}
        </button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.message && <span className="text-sm text-emerald-700">{state.message}</span>}
      </div>
    </form>
  );
}
