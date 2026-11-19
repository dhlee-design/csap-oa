import Link from "next/link";
import { AddToRegister, ApplyButton, DeleteRowButton, SyncButton } from "@/components/admin/CloudCompare";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { configured, currentComparison, lastSnapshot, ncloudConfig } from "@/lib/ncloud";
import { newRowValues, sheetRole } from "@/lib/ncloud/compare";
import { KIND_LABEL, type CloudAsset } from "@/lib/ncloud/types";
import { formatDate } from "@/lib/status";

const assetLine = (a: CloudAsset) =>
  [a.privateIp || a.domain, a.publicIp && `공인 ${a.publicIp}`, [a.os, a.osVersion].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");

export default async function CloudComparePage() {
  await requireAdmin();
  const ok = configured();
  const cfg = ncloudConfig();
  const snap = ok ? await lastSnapshot() : null;
  const cmp = snap ? await currentComparison(snap) : null;
  const targets = cmp
    ? new Map(
        (
          await db.asset.findMany({
            where: { recordId: { in: cmp.registerOnly.map((r) => r.record.id) } },
            select: { name: true, recordId: true },
          })
        ).map((a) => [a.recordId!, a.name]),
      )
    : new Map<string, string>();
  const withDiffs = cmp ? cmp.matched.filter((m) => m.rows.some((r) => r.diffs.length)) : [];
  const same = cmp ? cmp.matched.length - withDiffs.length : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="text-sm text-slate-500">
        <Link href="/admin/asset-register" className="hover:underline">
          자산관리대장
        </Link>{" "}
        / 네이버클라우드와 비교
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">네이버클라우드와 비교</h1>
          <p className="text-sm text-slate-500">
            네이버클라우드의 서버·Cloud DB 목록을 가져와 자산관리대장(OS·Kubernetes·DB 시트)과 비교합니다. 대장 값은 자동으로
            바뀌지 않고, 확인한 뒤 &apos;반영&apos;이나 &apos;대장에 추가&apos;를 눌러야 바뀝니다. 관리부서·운용자·용도는
            네이버클라우드에 없는 정보라 비교하지 않습니다.
          </p>
        </div>
        {ok && <SyncButton label={snap ? "다시 가져오기" : "네이버클라우드에서 가져오기"} />}
      </div>

      {!ok && (
        <section className="card space-y-2 px-5 py-4 text-sm">
          <h2 className="font-semibold">API 키 설정이 필요합니다</h2>
          <ol className="list-decimal space-y-1 pl-5 text-slate-700">
            <li>
              네이버클라우드 콘솔의 <b>Sub Account</b>에서 이 시스템 전용 계정을 만들고, 서버·Cloud DB를 <b>조회만</b> 할 수 있는
              권한을 줍니다.
            </li>
            <li>그 계정으로 <b>API 인증키(Access Key, Secret Key)</b>를 발급합니다.</li>
            <li>
              프로젝트 폴더의 <code>.env</code> 파일에 아래 두 줄을 넣고 서버를 다시 시작합니다. 이 파일은 GitHub에 올라가지
              않습니다.
              <pre className="mt-1 rounded bg-slate-100 px-3 py-2 text-xs">
                NCLOUD_ACCESS_KEY=&quot;발급받은 Access Key&quot;{"\n"}NCLOUD_SECRET_KEY=&quot;발급받은 Secret Key&quot;
              </pre>
            </li>
          </ol>
          <p className="text-xs text-slate-500">
            접속 주소 기본값은 공공기관용(Gov) <code>{cfg.apiUrl}</code>, 리전은 <code>{cfg.regionCode}</code>입니다. 다르면
            <code>NCLOUD_API_URL</code>, <code>NCLOUD_REGION</code>으로 바꿉니다. 이 PC에서 해당 주소로 인터넷 접속이 되어야 합니다.
          </p>
        </section>
      )}

      {ok && !snap && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          아직 가져온 적이 없습니다. &apos;네이버클라우드에서 가져오기&apos;를 누르세요.
        </p>
      )}

      {snap && cmp && (
        <>
          <p className="text-xs text-slate-500">
            {formatDate(new Date(snap.fetchedAt), true)} · {snap.fetchedBy} · 네이버클라우드 자산 {snap.assets.length}개
            {cfg.mockDir && <b className="ml-2 text-amber-700">모의 데이터</b>}
          </p>
          {snap.errors.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
              일부를 가져오지 못했습니다: {snap.errors.join(" / ")}. 해당 서비스의 자산은 아래 &apos;네이버클라우드에 없음&apos;에
              잘못 나올 수 있습니다.
            </p>
          )}
          {cmp.comparedSheets.length === 0 && (
            <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
              비교할 시트(OS·Kubernetes·DB)가 없습니다. 자산관리대장 양식을 먼저 올리세요.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="대장에 없음" value={cmp.cloudOnly.length} tone={cmp.cloudOnly.length ? "amber" : undefined} />
            <Kpi label="값이 다름" value={withDiffs.length} tone={withDiffs.length ? "amber" : undefined} />
            <Kpi label="네이버클라우드에 없음" value={cmp.registerOnly.length} tone={cmp.registerOnly.length ? "amber" : undefined} />
            <Kpi label="일치" value={same} />
          </div>

          <section className="card overflow-x-auto">
            <h2 className="px-5 pt-4 font-semibold">대장에 없는 자산</h2>
            <p className="px-5 pb-2 text-xs text-slate-500">
              네이버클라우드에는 있는데 자산관리대장에 없습니다. 새로 만든 자산이면 대장에 추가하세요. 호스트명·IP·OS·도입일이
              채워지고, 관리부서·운용자·용도는 추가한 뒤 대장에서 입력해야 합니다.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">종류</th>
                  <th className="th">이름</th>
                  <th className="th">IP · OS</th>
                  <th className="th">생성일</th>
                  <th className="th">대장에 추가</th>
                </tr>
              </thead>
              <tbody>
                {cmp.cloudOnly.map(({ asset, sheetId }) => {
                  const options = cmp.comparedSheets.filter(
                    (s) => sheetRole(s.name) === (asset.kind === "server" ? "server" : "db"),
                  );
                  return (
                    <tr key={asset.id}>
                      <td className="td whitespace-nowrap">{KIND_LABEL[asset.kind]}</td>
                      <td className="td font-mono text-xs">
                        {asset.name}
                        {asset.role && <span className="ml-1 text-slate-500">({asset.role})</span>}
                      </td>
                      <td className="td text-xs">{assetLine(asset)}</td>
                      <td className="td whitespace-nowrap text-xs">{asset.createDate}</td>
                      <td className="td">
                        {options.length ? (
                          <AddToRegister
                            cloudId={asset.id}
                            sheets={options.map((s) => ({ id: s.id, name: s.name }))}
                            defaultSheetId={sheetId}
                            valuesBySheet={Object.fromEntries(options.map((s) => [s.id, newRowValues(asset, s)]))}
                          />
                        ) : (
                          <span className="text-xs text-slate-400">맞는 시트 없음</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {cmp.cloudOnly.length === 0 && <EmptyRow cols={5} />}
              </tbody>
            </table>
          </section>

          <section className="card overflow-x-auto">
            <h2 className="px-5 pt-4 font-semibold">값이 다른 자산</h2>
            <p className="px-5 pb-2 text-xs text-slate-500">
              같은 자산인데 대장 값과 네이버클라우드 값이 다릅니다. 네이버클라우드 값이 맞으면 &apos;반영&apos;을 누르세요. 칸에
              여러 줄이 있으면 첫 줄만 바뀝니다.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">대장 행</th>
                  <th className="th">항목</th>
                  <th className="th">대장</th>
                  <th className="th">네이버클라우드</th>
                  <th className="th">반영</th>
                </tr>
              </thead>
              <tbody>
                {withDiffs.flatMap((m) =>
                  m.rows
                    .filter((r) => r.diffs.length)
                    .flatMap((r) =>
                      r.diffs.map((d, i) => (
                        <tr key={`${r.record.id}-${d.col}`}>
                          {i === 0 && (
                            <td className="td align-top" rowSpan={r.diffs.length}>
                              <Link
                                href={`/admin/asset-register?sheet=${r.sheet.id}`}
                                className="font-mono text-xs text-brand-700 hover:underline"
                              >
                                {r.recordName}
                              </Link>
                              <div className="text-xs text-slate-500">{r.sheet.name}</div>
                              {r.diffs.length > 1 && (
                                <div className="mt-1">
                                  <ApplyButton
                                    recordId={r.record.id}
                                    label="모두 반영"
                                    changes={r.diffs.map((x) => ({ col: x.col, value: x.cloud === "(없음)" ? "" : x.cloud }))}
                                  />
                                </div>
                              )}
                            </td>
                          )}
                          <td className="td whitespace-nowrap text-xs">{d.label}</td>
                          <td className="td text-xs text-red-700">{d.register || "(비어 있음)"}</td>
                          <td className="td text-xs text-emerald-700">
                            {d.cloud}
                            {d.note && <div className="text-slate-400">{d.note}</div>}
                          </td>
                          <td className="td">
                            <ApplyButton
                              recordId={r.record.id}
                              label="반영"
                              changes={[{ col: d.col, value: d.cloud === "(없음)" ? "" : d.cloud }]}
                            />
                          </td>
                        </tr>
                      )),
                    ),
                )}
                {withDiffs.length === 0 && <EmptyRow cols={5} />}
              </tbody>
            </table>
          </section>

          <section className="card overflow-x-auto">
            <h2 className="px-5 pt-4 font-semibold">네이버클라우드에 없는 대장 행</h2>
            <p className="px-5 pb-2 text-xs text-slate-500">
              대장에는 있는데 네이버클라우드에서 찾지 못했습니다. 반납한 자산이면 대장에서 삭제하고, 이름이 바뀐 자산이면
              대장의 호스트명을 고치세요.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">시트</th>
                  <th className="th">이름</th>
                  <th className="th">점검 대상</th>
                  <th className="th">처리</th>
                </tr>
              </thead>
              <tbody>
                {cmp.registerOnly.map((r) => (
                  <tr key={r.record.id}>
                    <td className="td whitespace-nowrap text-xs">{r.sheet.name}</td>
                    <td className="td">
                      <Link
                        href={`/admin/asset-register?sheet=${r.sheet.id}`}
                        className="font-mono text-xs text-brand-700 hover:underline"
                      >
                        {r.recordName}
                      </Link>
                    </td>
                    <td className="td text-xs">{targets.get(r.record.id) ?? "-"}</td>
                    <td className="td">
                      <DeleteRowButton recordId={r.record.id} name={r.recordName} target={targets.get(r.record.id)} />
                    </td>
                  </tr>
                ))}
                {cmp.registerOnly.length === 0 && <EmptyRow cols={4} />}
              </tbody>
            </table>
          </section>

          <details className="card px-5 py-3 text-sm">
            <summary className="cursor-pointer font-semibold">일치하는 자산 {same}개</summary>
            <ul className="mt-2 grid gap-1 text-xs text-slate-600 md:grid-cols-2">
              {cmp.matched
                .filter((m) => !m.rows.some((r) => r.diffs.length))
                .map((m) => (
                  <li key={m.asset.id}>
                    <span className="font-mono">{m.asset.name}</span> → {m.rows.map((r) => r.sheet.name).join(", ")}
                  </li>
                ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "amber" }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold ${tone === "amber" ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td className="td text-center text-xs text-slate-400" colSpan={cols}>
        없음
      </td>
    </tr>
  );
}
