import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { AssetLinkCell, AutoLinkButton } from "@/components/admin/AssetLink";
import { AssetToggle } from "@/components/admin/AssetToggle";
import { allRecords } from "@/lib/asset-register";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAsset } from "../actions";

const KIND: Record<string, string> = { VPN: "VPN", SERVER: "서버", DB: "DB", CACHE: "캐시", ETC: "기타" };

/** 대장 행에서 확인용으로 보여 줄 값 (IP·OS·운용자) */
function summary(r: Awaited<ReturnType<typeof allRecords>>[number]): string {
  const pick = (re: RegExp) => {
    const c = r.columns.find((c) => !c.hidden && re.test(c.label));
    return c ? r.values[c.col]?.split("\n")[0] : undefined;
  };
  return [pick(/^IP$|IP\b/), pick(/^OS$|OS\)?$|버전/), pick(/운용자|담당자|사용자/)].filter(Boolean).join(" · ");
}

export default async function AssetsPage() {
  await requireAdmin();
  const [assets, records] = await Promise.all([db.asset.findMany({ orderBy: { sortOrder: "asc" } }), allRecords()]);
  const byId = new Map(records.map((r) => [r.id, r]));
  const taken = new Set(assets.map((a) => a.recordId).filter(Boolean));
  const options = records.map((r) => ({ id: r.id, sheet: r.sheetName, name: r.name || "(이름 없음)", taken: taken.has(r.id) }));
  const unlinked = assets.filter((a) => a.active && !a.recordId);
  const hasRegister = records.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">대상 자산</h1>
        <p className="text-sm text-slate-500">
          점검 대상 시스템 목록입니다. &apos;access-review&apos; 태그가 붙은 자산이 접근권한 점검 대상이 됩니다. 변경 내용은
          다음에 만들어지는 회차부터 반영되고, 이미 만들어진 회차는 그대로 유지됩니다. 각 대상은{" "}
          <Link href="/admin/asset-register" className="text-brand-700 underline">
            자산관리대장
          </Link>
          의 행과 연결되며, 대장에서 호스트명을 바꾸면 대상 이름도 따라 바뀝니다.
        </p>
      </div>

      {!hasRegister ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          자산관리대장이 아직 없습니다.{" "}
          <Link href="/admin/asset-register" className="font-medium underline">
            자산관리대장에서 양식 파일을 올리면
          </Link>{" "}
          대상 자산이 이름으로 자동 연결됩니다.
        </p>
      ) : unlinked.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            자산관리대장에 없는 점검 대상이 {unlinked.length}개 있습니다: {unlinked.map((a) => a.name).join(", ")}. 대장에
            추가하거나 아래에서 행을 직접 고르세요.
          </span>
          <AutoLinkButton />
        </div>
      ) : (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          사용 중인 점검 대상이 모두 자산관리대장과 연결되어 있습니다.
        </p>
      )}

      <section className="card px-5 py-4">
        <h2 className="mb-3 font-semibold">자산 추가</h2>
        <p className="mb-3 text-xs text-slate-500">
          자산관리대장에 있는 자산이면 대장 화면에서 &apos;점검 대상 지정&apos;을 누르는 편이 간단합니다. 여기서 추가하면 같은
          이름의 대장 행에 자동으로 연결됩니다.
        </p>
        <ActionForm action={createAsset} submitLabel="추가" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label" htmlFor="f-name">이름</label>
              <input id="f-name" name="name" className="input" required placeholder="예: new-steg-web06" />
            </div>
            <div>
              <label className="label" htmlFor="f-kind">유형</label>
              <select id="f-kind" name="kind" className="input" defaultValue="SERVER">
                {Object.entries(KIND).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-tags">태그 (쉼표 구분)</label>
              <input id="f-tags" name="tags" className="input" defaultValue="access-review" />
            </div>
          </div>
        </ActionForm>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <th className="th">이름</th>
              <th className="th">유형</th>
              <th className="th">태그</th>
              <th className="th">자산관리대장</th>
              <th className="th">사용</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const rec = a.recordId ? byId.get(a.recordId) : undefined;
              return (
                <tr key={a.id} className={a.active ? "" : "opacity-50"}>
                  <td className="td font-mono text-xs whitespace-nowrap">{a.name}</td>
                  <td className="td whitespace-nowrap">{KIND[a.kind] ?? a.kind}</td>
                  <td className="td whitespace-nowrap text-slate-600">{a.tags || "-"}</td>
                  <td className="td">
                    <AssetLinkCell
                      assetId={a.id}
                      linked={
                        rec
                          ? { recordId: rec.id, sheetId: rec.sheetId, sheet: rec.sheetName, name: rec.name, summary: summary(rec) }
                          : null
                      }
                      options={hasRegister ? options : []}
                    />
                  </td>
                  <td className="td">
                    <AssetToggle assetId={a.id} active={a.active} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
