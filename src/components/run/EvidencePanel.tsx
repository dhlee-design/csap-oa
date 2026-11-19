"use client";

import { useRef, useState, useTransition } from "react";
import { deleteEvidence, uploadEvidence } from "@/app/(app)/runs/[id]/actions";
import type { EvidenceSlot } from "@/lib/templates/types";

export type EvidenceItem = {
  id: string;
  slotKey: string;
  originalName: string;
  storedName: string;
  size: number;
  sha256: string;
  mimeType: string;
  uploader: string;
  createdAt: string;
};

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(n / 1024)}KB`);

export function EvidencePanel({
  runId,
  slots,
  evidences,
  canEdit,
}: {
  runId: string;
  slots: EvidenceSlot[];
  evidences: EvidenceItem[];
  canEdit: boolean;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-3">
        <h2 className="font-semibold">증적</h2>
        <p className="text-xs text-slate-500">
          파일을 끌어다 놓거나, 캡처한 뒤 해당 칸을 클릭하고 Ctrl+V로 붙여넣으세요. 업로드 시 SHA-256 해시가 기록되고
          승인 후에는 변경할 수 없습니다.
        </p>
      </div>
      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {slots.map((s) => (
          <Slot
            key={s.key}
            runId={runId}
            slot={s}
            items={evidences.filter((e) => e.slotKey === s.key)}
            canEdit={canEdit}
          />
        ))}
      </div>
    </section>
  );
}

function Slot({
  runId,
  slot,
  items,
  canEdit,
}: {
  runId: string;
  slot: EvidenceSlot;
  items: EvidenceItem[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = (files: File[]) => {
    if (!files.length) return;
    const fd = new FormData();
    fd.set("slotKey", slot.key);
    files.forEach((f) => fd.append("files", f));
    start(async () => {
      setError(null);
      const r = await uploadEvidence(runId, fd);
      if (r.error) setError(r.error);
      if (r.errors) setError(r.errors.join(" / "));
    });
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (!files.length) return;
    e.preventDefault();
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    upload(files.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `캡처_${stamp}_${i + 1}.png`, { type: f.type })));
  };

  const missing = slot.required && items.length === 0;

  return (
    <div id={`slot-${slot.key}`} className="grid gap-3 px-5 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{slot.key}</span>
          {slot.title}
        </div>
        <p className="mt-1 text-xs text-slate-500">{slot.guide}</p>
        <p className="mt-1 text-[11px]">
          {slot.required ? (
            missing ? (
              <span className="text-amber-700">필수 · 미첨부</span>
            ) : (
              <span className="text-emerald-700">필수 · 첨부됨</span>
            )
          ) : (
            <span className="text-slate-400">선택</span>
          )}
        </p>
      </div>
      <div className="space-y-2">
        {items.length > 0 && (
          <ul className="space-y-1.5">
            {items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                {e.mimeType.startsWith("image/") ? (
                  <a href={`/api/evidence/${e.id}`} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/evidence/${e.id}`} alt={e.originalName} className="h-10 w-14 rounded object-cover" />
                  </a>
                ) : (
                  <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-500 uppercase">
                    {e.storedName.split(".").pop()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/evidence/${e.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-medium text-brand-700 hover:underline"
                    title={e.storedName}
                  >
                    {e.storedName}
                  </a>
                  <div className="truncate text-slate-500" title={`SHA-256 ${e.sha256}`}>
                    원본 {e.originalName} · {kb(e.size)} · {e.uploader} · {e.createdAt} · SHA-256 {e.sha256.slice(0, 12)}…
                  </div>
                </div>
                <a href={`/api/evidence/${e.id}?download`} className="text-slate-500 hover:underline">
                  받기
                </a>
                {canEdit && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`${e.originalName}을(를) 삭제할까요?`))
                        start(async () => {
                          const r = await deleteEvidence(e.id);
                          if (r.error) setError(r.error);
                        });
                    }}
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div
            tabIndex={0}
            role="button"
            aria-label={`${slot.key} 증적 파일 올리기`}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            onPaste={onPaste}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              upload(Array.from(e.dataTransfer.files));
            }}
            className={`cursor-pointer rounded-lg border-2 border-dashed px-3 py-3 text-center text-xs outline-none focus:border-brand-500 focus:bg-brand-50 ${
              over ? "border-brand-500 bg-brand-50" : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            {pending ? "올리는 중…" : "클릭해서 파일 선택 · 끌어다 놓기 · 클릭 후 Ctrl+V로 캡처 붙여넣기"}
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                upload(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>
        )}
        {!canEdit && items.length === 0 && <p className="text-xs text-slate-400">첨부된 증적이 없습니다.</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
