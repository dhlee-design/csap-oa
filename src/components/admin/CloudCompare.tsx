"use client";

import { useState, useTransition } from "react";
import { deleteRecord } from "@/app/(app)/admin/asset-register/actions";
import { addFromCloud, applyCloudValues, syncCloud } from "@/app/(app)/admin/asset-register/cloud/actions";
import type { AssetRow } from "@/lib/asset-register/workbook";

function useAct() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const run = (fn: () => Promise<{ error?: string; message?: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r.error) setMsg({ tone: "error", text: r.error });
      else if (r.message) setMsg({ tone: "ok", text: r.message });
    });
  const view = msg && <span className={`text-xs ${msg.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>;
  return { pending, run, view };
}

export function SyncButton({ label }: { label: string }) {
  const { pending, run, view } = useAct();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(syncCloud)}>
        {pending ? "가져오는 중…" : label}
      </button>
      {view}
    </span>
  );
}

export function AddToRegister({
  cloudId,
  sheets,
  defaultSheetId,
  valuesBySheet,
}: {
  cloudId: string;
  sheets: { id: string; name: string }[];
  defaultSheetId: string | null;
  valuesBySheet: Record<string, AssetRow>;
}) {
  const [sheetId, setSheetId] = useState(defaultSheetId ?? sheets[0]?.id ?? "");
  const { pending, run, view } = useAct();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        className="input input-sm w-auto"
        value={sheetId}
        onChange={(e) => setSheetId(e.target.value)}
        aria-label="추가할 시트"
      >
        {sheets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending || !sheetId}
        onClick={() => run(() => addFromCloud(sheetId, valuesBySheet[sheetId] ?? {}, cloudId))}
      >
        대장에 추가
      </button>
      {view}
    </div>
  );
}

export function ApplyButton({
  recordId,
  changes,
  label,
}: {
  recordId: string;
  changes: { col: string; value: string }[];
  label: string;
}) {
  const { pending, run, view } = useAct();
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={() => run(() => applyCloudValues(recordId, changes))}
      >
        {pending ? "반영 중…" : label}
      </button>
      {view}
    </span>
  );
}

export function DeleteRowButton({ recordId, name, target }: { recordId: string; name: string; target?: string }) {
  const { pending, run, view } = useAct();
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className="btn btn-sm text-red-600"
        disabled={pending}
        onClick={() => {
          const warn = target ? `\n\n점검 대상 '${target}'과(와) 연결되어 있습니다. 점검 대상은 남고 연결만 끊깁니다.` : "";
          if (confirm(`${name} 행을 자산관리대장에서 삭제할까요? 삭제한 값은 감사 로그에 남습니다.${warn}`))
            run(() => deleteRecord(recordId));
        }}
      >
        대장에서 삭제
      </button>
      {view}
    </span>
  );
}
