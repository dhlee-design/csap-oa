"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  approveRun,
  createCorrection,
  rejectRun,
  saveRun,
  submitRun,
} from "@/app/(app)/runs/[id]/actions";
import { evaluate } from "@/lib/templates/engine";
import type { RunData, TemplateSchema } from "@/lib/templates/types";
import { ChecklistView } from "./ChecklistView";
import { EvidencePanel, type EvidenceItem } from "./EvidencePanel";
import { MatrixView } from "./MatrixView";
import { SummaryView } from "./SummaryView";
import { TableView } from "./TableView";

export type ApprovalItem = { id: string; decision: string; comment: string | null; actor: string; createdAt: string };

const DECISION_LABEL: Record<string, string> = { SUBMIT: "승인 요청", APPROVE: "승인", REJECT: "반려" };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function RunEditor(props: {
  runId: string;
  schema: TemplateSchema;
  period: string;
  initialData: RunData;
  initialInspectedAt: string;
  status: string;
  canEdit: boolean;
  canDecide: boolean;
  blockedBySeparation?: boolean;
  isApprover?: boolean;
  canCorrect: boolean;
  evidences: EvidenceItem[];
  approvals: ApprovalItem[];
}) {
  const { runId, schema, canEdit } = props;
  const [data, setData] = useState<RunData>(props.initialData);
  const [inspectedAt, setInspectedAt] = useState(props.initialInspectedAt || (canEdit ? today() : ""));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const ctx = useMemo(
    () => ({
      period: props.period,
      params: schema.params ?? {},
      asOf: inspectedAt ? new Date(`${inspectedAt}T23:59:59`) : new Date(),
    }),
    [props.period, schema.params, inspectedAt],
  );

  const filledSlots = useMemo(() => new Set(props.evidences.map((e) => e.slotKey)), [props.evidences]);
  const ev = useMemo(() => evaluate(schema, data, ctx, filledSlots), [schema, data, ctx, filledSlots]);

  const update = (key: string, value: RunData[string]) => {
    setData((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setMessage(null);
    setSubmitErrors([]);
  };

  const run = (fn: () => Promise<{ ok?: boolean; error?: string; errors?: string[] }>, okText: string) =>
    start(async () => {
      setSubmitErrors([]);
      const r = await fn();
      if (r.error) setMessage({ tone: "error", text: r.error });
      else if (r.errors?.length) {
        // errors는 submitRun이 내용을 저장한 뒤 검증에서 막힌 경우에만 온다 → 저장은 끝난 상태
        setDirty(false);
        setSubmitErrors(r.errors);
        setMessage({ tone: "error", text: `제출할 수 없습니다. 아래 ${r.errors.length}건을 확인하세요.` });
      } else {
        setDirty(false);
        setComment("");
        setMessage({ tone: "ok", text: okText });
      }
    });

  const save = () => run(() => saveRun(runId, data, inspectedAt || null), "저장했습니다.");
  const submit = () => {
    if (!confirm("승인을 요청할까요? 승인자가 처리하기 전까지는 수정할 수 없습니다.")) return;
    run(() => submitRun(runId, data, inspectedAt || null), "승인을 요청했습니다.");
  };
  const percent = ev.total ? Math.round((ev.filled / ev.total) * 100) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <section className="card flex flex-wrap items-center gap-4 px-5 py-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            점검일
            <input
              type="date"
              className="input input-sm w-auto"
              value={inspectedAt}
              disabled={!canEdit}
              onChange={(e) => {
                setInspectedAt(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          {schema.escalation && (
            <p className="text-xs text-amber-700">⚠ {schema.escalation}</p>
          )}
        </section>

        {schema.sections.map((s) => {
          const value = data[s.key];
          const common = { disabled: !canEdit, onChange: (v: RunData[string]) => update(s.key, v) };
          switch (s.type) {
            case "checklist":
              return (
                <ChecklistView key={s.key} section={s} value={value as never} evidences={props.evidences} {...common} />
              );
            case "matrix":
              return <MatrixView key={s.key} section={s} value={value as never} {...common} />;
            case "table":
              return <TableView key={s.key} section={s} value={value as never} ctx={ctx} {...common} />;
            case "summary":
              return (
                <SummaryView key={s.key} section={s} value={value as never} findings={ev.findings} {...common} />
              );
          }
        })}

        <EvidencePanel
          runId={runId}
          slots={schema.evidenceSlots}
          evidences={props.evidences}
          canEdit={canEdit}
        />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="card px-4 py-4">
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-medium">입력 진행률</span>
            <span className="text-slate-500">
              {ev.filled}/{ev.total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <ul className="mt-3 space-y-1 text-xs text-slate-600">
            <li>
              이상 항목:{" "}
              <b className={ev.findings.length ? "text-red-600" : ""}>{ev.findings.length}건</b>
            </li>
            <li>
              필수 증적 미첨부:{" "}
              <b className={ev.missingEvidence.length ? "text-amber-600" : ""}>{ev.missingEvidence.length}건</b>
            </li>
          </ul>

          {message && (
            <p
              role="status"
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
            >
              {message.text}
            </p>
          )}
          {submitErrors.length > 0 && (
            <ul className="mt-2 max-h-60 list-disc space-y-0.5 overflow-y-auto pl-4 text-xs text-red-700">
              {submitErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {canEdit && (
            <div className="mt-4 grid gap-2">
              <button className="btn" onClick={save} disabled={pending}>
                {dirty ? "저장 ●" : "저장"}
              </button>
              <button className="btn btn-primary" onClick={submit} disabled={pending}>
                저장하고 승인 요청
              </button>
            </div>
          )}

          {props.canDecide && (
            <div className="mt-4 space-y-2">
              <textarea
                className="input min-h-20"
                placeholder="승인 의견 / 반려 사유"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn"
                  disabled={pending}
                  onClick={() => run(() => rejectRun(runId, comment), "반려했습니다.")}
                >
                  반려
                </button>
                <button
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("승인하면 이 회차는 잠기고 더 이상 수정할 수 없습니다. 승인할까요?"))
                      run(() => approveRun(runId, comment), "승인했습니다.");
                  }}
                >
                  승인
                </button>
              </div>
            </div>
          )}

          {props.canCorrect && (
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500">
                승인된 회차는 수정할 수 없습니다. 잘못된 내용이 있으면 정정본을 만드세요. 원본은 그대로 보존됩니다.
              </p>
              <input
                className="input input-sm"
                placeholder="정정 사유"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button
                className="btn w-full"
                disabled={pending}
                onClick={() => run(() => createCorrection(runId, comment), "정정본을 만들었습니다.")}
              >
                정정본 만들기
              </button>
            </div>
          )}

          {!canEdit && !props.canDecide && !props.canCorrect && (
            <p className="mt-4 text-xs text-slate-500">
              {props.blockedBySeparation
                ? "이 회차를 직접 입력·제출했기 때문에 승인할 수 없습니다 (직무 분리). 다른 승인자를 지정하세요."
                : props.status === "SUBMITTED"
                  ? "승인자의 처리를 기다리는 중입니다."
                  : props.status === "APPROVED"
                    ? "승인 완료되어 잠긴 회차입니다."
                    : props.status === "REJECTED"
                      ? "반려된 회차입니다. 점검자가 수정해 다시 승인 요청하면 처리할 수 있습니다."
                      : props.isApprover
                        ? "점검자가 입력 중입니다. 승인 요청이 오면 처리할 수 있습니다."
                        : "이 회차의 담당자가 아니어서 조회만 할 수 있습니다."}
            </p>
          )}
        </section>

        <section className="card px-4 py-4">
          <h3 className="mb-2 text-sm font-semibold">승인 이력</h3>
          {props.approvals.length === 0 ? (
            <p className="text-xs text-slate-500">아직 없습니다.</p>
          ) : (
            <ol className="space-y-2 text-xs">
              {props.approvals.map((a) => (
                <li key={a.id} className="border-l-2 border-slate-200 pl-2">
                  <div>
                    <b
                      className={
                        a.decision === "APPROVE"
                          ? "text-emerald-700"
                          : a.decision === "REJECT"
                            ? "text-red-700"
                            : "text-blue-700"
                      }
                    >
                      {DECISION_LABEL[a.decision]}
                    </b>{" "}
                    · {a.actor}
                  </div>
                  <div className="text-slate-500">{a.createdAt}</div>
                  {a.comment && <div className="mt-0.5 text-slate-700">“{a.comment}”</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}
