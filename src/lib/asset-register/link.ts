import "server-only";
import { db } from "../db";
import { nameKey, recordName } from "./keys";
import type { AssetColumn, AssetRow } from "./workbook";

export type RecordRef = {
  id: string;
  sheetId: string;
  sheetName: string;
  sheetOrder: number;
  sortOrder: number;
  name: string; // 대표 이름
  values: AssetRow;
  columns: AssetColumn[];
};

/** 대장 전체 행을 시트 순서·행 순서대로 (대표 이름 포함) */
export async function allRecords(): Promise<RecordRef[]> {
  const sheets = await db.assetSheet.findMany({
    orderBy: { sortOrder: "asc" },
    include: { records: { orderBy: { sortOrder: "asc" } } },
  });
  return sheets.flatMap((s) => {
    const columns = JSON.parse(s.columns) as AssetColumn[];
    return s.records.map((r) => {
      const values = JSON.parse(r.values) as AssetRow;
      return {
        id: r.id,
        sheetId: s.id,
        sheetName: s.name,
        sheetOrder: s.sortOrder,
        sortOrder: r.sortOrder,
        name: recordName(columns, values),
        values,
        columns,
      };
    });
  });
}

/**
 * 연결되지 않은 대상 자산을 대장 행과 이름으로 맞춰 연결한다.
 * 같은 이름이 여러 시트에 있으면 앞 시트(예: OS)의 첫 행을 쓴다. 이미 다른 자산과 연결된 행은 건너뛴다.
 */
export async function autoLinkAssets(): Promise<{ linked: { asset: string; sheet: string }[]; unmatched: string[] }> {
  const [assets, records] = await Promise.all([
    db.asset.findMany({ orderBy: { sortOrder: "asc" } }),
    allRecords(),
  ]);
  const taken = new Set(assets.map((a) => a.recordId).filter(Boolean) as string[]);
  const linked: { asset: string; sheet: string }[] = [];
  const unmatched: string[] = [];

  for (const a of assets) {
    if (a.recordId) continue;
    const key = nameKey(a.name);
    const exact = records.find((r) => !taken.has(r.id) && r.name.toLowerCase() === a.name.toLowerCase());
    const loose = exact ?? records.find((r) => !taken.has(r.id) && nameKey(r.name) === key);
    if (!loose) {
      unmatched.push(a.name);
      continue;
    }
    await db.asset.update({ where: { id: a.id }, data: { recordId: loose.id } });
    taken.add(loose.id);
    linked.push({ asset: a.name, sheet: loose.sheetName });
  }
  return { linked, unmatched };
}

/**
 * 대장 행의 대표 이름(호스트명 등)이 실제로 바뀐 경우에만 연결된 대상 자산 이름도 맞춘다.
 * 다른 값만 고쳤을 때는 건드리지 않고, 다른 자산과 이름이 겹치면 그대로 둔다.
 */
export async function syncAssetName(
  recordId: string,
  oldName: string,
  newName: string,
): Promise<{ from: string; to: string } | null> {
  if (!newName || nameKey(oldName) === nameKey(newName)) return null;
  const asset = await db.asset.findUnique({ where: { recordId } });
  if (!asset || nameKey(asset.name) === nameKey(newName)) return null;
  if (await db.asset.findUnique({ where: { name: newName } })) return null;
  await db.asset.update({ where: { id: asset.id }, data: { name: newName } });
  return { from: asset.name, to: newName };
}
