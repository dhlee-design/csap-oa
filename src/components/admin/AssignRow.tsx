"use client";

import { useState, useTransition } from "react";
import { assignTemplate } from "@/app/(app)/admin/actions";

type U = { id: string; name: string; loginId: string };

export function AssignRow(props: {
  templateId: string;
  users: U[];
  inspectorLabel: string;
  approverLabel: string;
  inspectorId: string | null;
  approverId: string | null;
}) {
  const [inspector, setInspector] = useState(props.inspectorId ?? "");
  const [approver, setApprover] = useState(props.approverId ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = inspector !== (props.inspectorId ?? "") || approver !== (props.approverId ?? "");

  const pick = (label: string, value: string, set: (v: string) => void) => (
    <label className="text-sm">
      <span className="label">{label}</span>
      <select className="input min-w-44" value={value} onChange={(e) => set(e.target.value)}>
        <option value="">미지정</option>
        {props.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.loginId})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      {pick(`점검자 · ${props.inspectorLabel}`, inspector, setInspector)}
      {pick(`승인자 · ${props.approverLabel}`, approver, setApprover)}
      <button
        className="btn btn-primary"
        disabled={!changed || pending}
        onClick={() =>
          start(async () => {
            const r = await assignTemplate(props.templateId, inspector || null, approver || null);
            setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.message ?? "저장했습니다." });
          })
        }
      >
        저장
      </button>
      {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
    </div>
  );
}
