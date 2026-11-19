"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(auth)/actions";

export type Field = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: "numeric";
  hint?: string;
};

export function AuthForm({
  action,
  fields,
  submitLabel,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  fields: Field[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {fields.map((f, i) => (
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            placeholder={f.placeholder}
            required={f.required ?? true}
            inputMode={f.inputMode}
            autoFocus={i === 0}
            className="input"
            // 비밀번호 관리자 확장 프로그램이 로드 전에 autocomplete 속성을 바꿔 생기는 경고를 막는다
            suppressHydrationWarning
          />
          {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
        </div>
      ))}
      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "처리 중…" : submitLabel}
      </button>
    </form>
  );
}
