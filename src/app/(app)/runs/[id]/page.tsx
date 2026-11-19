import Link from "next/link";
import { notFound } from "next/navigation";
import { RunEditor } from "@/components/run/RunEditor";
import { StatusBadge } from "@/components/StatusBadge";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FREQUENCY_LABEL, periodLabel } from "@/lib/period";
import { parseData, parseSchema, runParticipants } from "@/lib/runs";
import { EDITABLE_STATUSES, formatDate, isOverdue } from "@/lib/status";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const run = await db.inspectionRun.findUnique({
    where: { id },
    include: {
      template: true,
      inspector: true,
      approver: true,
      supersedes: { select: { id: true, revision: true } },
      supersededBy: { select: { id: true, revision: true } },
      evidences: { where: { deletedAt: null }, include: { uploader: true }, orderBy: { createdAt: "asc" } },
      approvals: { include: { actor: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!run) notFound();

  const schema = parseSchema(run.schema);
  const canEdit =
    !run.lockedAt &&
    EDITABLE_STATUSES.includes(run.status) &&
    (user.role === "ADMIN" || run.inspectorId === user.id || run.inspectorId === null);
  const participated = (await runParticipants(run.id)).has(user.id);
  const canDecide =
    run.status === "SUBMITTED" &&
    (run.approverId === user.id || user.role === "ADMIN") &&
    run.inspectorId !== user.id &&
    !participated;
  const canCorrect =
    run.status === "APPROVED" && !run.supersededBy && (user.role === "ADMIN" || run.inspectorId === user.id);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="text-sm text-slate-500">
        <Link href="/runs" className="hover:underline">
          점검 일정
        </Link>{" "}
        / {run.template.name}
      </div>

      <header className="card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              {schema.name} · {periodLabel(run.period)}
              {run.revision > 0 && <span className="ml-2 text-base text-slate-500">정정본 {run.revision}</span>}
            </h1>
            <p className="mt-1 text-sm text-slate-600">{schema.description}</p>
          </div>
          <StatusBadge status={run.status} overdue={!run.supersededBy && isOverdue(run)} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <Info label="근거" value={schema.basis} wide />
          <Info label="주기" value={FREQUENCY_LABEL[schema.frequency]} />
          <Info label="마감일" value={formatDate(run.dueDate)} />
          <Info label={schema.roles.inspector} value={run.inspector?.name ?? "미지정"} />
          <Info label={schema.roles.approver} value={run.approver?.name ?? "미지정"} />
          <Info label="승인일" value={formatDate(run.approvedAt, true)} />
          {schema.params?.target && <Info label="점검 대상" value={String(schema.params.target)} />}
        </dl>
        {run.supersededBy && (
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm">
            이 회차는 정정되었습니다.{" "}
            <Link href={`/runs/${run.supersededBy.id}`} className="font-medium text-brand-700 underline">
              정정본 {run.supersededBy.revision} 보기
            </Link>
          </p>
        )}
        {run.supersedes && (
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm">
            이 회차는 정정본입니다.{" "}
            <Link href={`/runs/${run.supersedes.id}`} className="font-medium text-brand-700 underline">
              원본 보기
            </Link>
          </p>
        )}
      </header>

      <RunEditor
        runId={run.id}
        schema={schema}
        period={run.period}
        initialData={parseData(run.data)}
        initialInspectedAt={run.inspectedAt ? formatDate(run.inspectedAt) : ""}
        status={run.status}
        canEdit={canEdit}
        canDecide={canDecide}
        blockedBySeparation={run.status === "SUBMITTED" && run.approverId === user.id && participated}
        isApprover={run.approverId === user.id}
        canCorrect={canCorrect}
        evidences={run.evidences.map((e) => ({
          id: e.id,
          slotKey: e.slotKey,
          originalName: e.originalName,
          storedName: e.storedName,
          size: e.size,
          sha256: e.sha256,
          mimeType: e.mimeType,
          uploader: e.uploader.name,
          createdAt: formatDate(e.createdAt, true),
        }))}
        approvals={run.approvals.map((a) => ({
          id: a.id,
          decision: a.decision,
          comment: a.comment,
          actor: a.actor.name,
          createdAt: formatDate(a.createdAt, true),
        }))}
      />
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}
