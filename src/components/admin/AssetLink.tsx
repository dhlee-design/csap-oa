"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { linkTarget, markTarget, runAutoLink } from "@/app/(app)/admin/asset-register/actions";

type Option = { id: string; sheet: string; name: string; taken: boolean };
type Linked = { recordId: string; sheetId: string; sheet: string; name: string; summary: string };

/** 대상 자산 화면: 연결된 대장 행 표시, 또는 행 고르기 */
export function AssetLinkCell({ assetId, linked, options }: { assetId: string; linked: Linked | null; options: Option[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (recordId: string | null) =>
    start(async () => {
      setError(null);
      const r = await linkTarget(assetId, recordId);
      if (r.error) setError(r.error);
    });

  if (linked) {
    return (
      <div className="text-xs">
        <Link href={`/admin/asset-register?sheet=${linked.sheetId}`} className="font-medium text-brand-700 hover:underline">
          {linked.sheet} · {linked.name}
        </Link>
        {linked.summary && <div className="text-slate-500">{linked.summary}</div>}
        <button
          type="button"
          className="mt-0.5 text-slate-400 underline hover:text-slate-600"
          disabled={pending}
          onClick={() => {
            if (confirm("자산관리대장과의 연결을 끊을까요? 점검 대상에서는 빠지지 않습니다.")) run(null);
          }}
        >
          연결 해제
        </button>
        {error && <div className="text-red-600">{error}</div>}
      </div>
    );
  }

  if (!options.length) return <span className="text-xs text-slate-400">대장 없음</span>;

  const sheets = [...new Set(options.map((o) => o.sheet))];
  return (
    <div className="text-xs">
      <span className="badge mb-1 bg-amber-100 text-amber-800">대장에 없음</span>
      <select
        className="input input-sm block w-56"
        defaultValue=""
        disabled={pending}
        aria-label="연결할 자산관리대장 행"
        onChange={(e) => e.target.value && run(e.target.value)}
      >
        <option value="">대장 행 고르기…</option>
        {sheets.map((s) => (
          <optgroup key={s} label={s}>
            {options
              .filter((o) => o.sheet === s)
              .map((o) => (
                <option key={o.id} value={o.id} disabled={o.taken}>
                  {o.name}
                  {o.taken ? " (연결됨)" : ""}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {error && <div className="text-red-600">{error}</div>}
    </div>
  );
}

export function AutoLinkButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={() => start(async () => setMsg((await runAutoLink()).message ?? null))}
      >
        이름으로 자동 연결
      </button>
      {msg && <span className="text-xs">{msg}</span>}
    </span>
  );
}

/** 자산관리대장 화면: 점검 대상 표시 / 지정 */
export function TargetCell({
  recordId,
  target,
}: {
  recordId: string;
  target: { name: string; active: boolean; tags: string } | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (target) {
    return (
      <Link
        href="/admin/assets"
        title={`대상 자산: ${target.name} (${target.tags || "태그 없음"})`}
        className={`badge ${target.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
      >
        {target.active ? "점검 대상" : "점검 대상(중지)"}
      </Link>
    );
  }
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        className="text-xs text-slate-500 underline hover:text-brand-700"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await markTarget(recordId);
            if (r.error) setError(r.error);
          })
        }
      >
        {pending ? "지정 중…" : "점검 대상 지정"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
