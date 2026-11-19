"use client";

import { useActionState, useState } from "react";
import { uploadTemplate, type Result } from "@/app/(app)/admin/asset-register/actions";

export function TemplateUpload({ hasData }: { hasData: boolean }) {
  const [open, setOpen] = useState(!hasData);
  const [state, action, pending] = useActionState(
    async (s: Result | undefined, f: FormData) => {
      const r = await uploadTemplate(s, f);
      if (r.ok) setOpen(false);
      return r;
    },
    undefined,
  );

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          양식 파일 다시 올리기
        </button>
        {state?.message && <span className="text-xs text-emerald-700">{state.message}</span>}
      </div>
    );
  }

  return (
    <form action={action} className="w-full max-w-md space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input type="file" name="file" accept=".xlsx" required className="block w-full text-sm" />
      {hasData ? (
        <label className="flex items-start gap-2 text-xs text-red-700">
          <input type="checkbox" name="confirm" value="yes" required className="mt-0.5" />
          지금 등록된 자산 데이터를 모두 지우고 이 파일의 내용으로 바꿉니다. 이후 다운로드는 이 파일의 양식을 따릅니다.
        </label>
      ) : (
        <input type="hidden" name="confirm" value="yes" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "읽는 중…" : "올리기"}
        </button>
        {hasData && (
          <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
            취소
          </button>
        )}
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
