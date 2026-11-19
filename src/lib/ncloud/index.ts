import "server-only";
import { db } from "../db";
import { parseColumns, parseValues } from "../asset-register";
import { isConfigured, ncloudConfig } from "./client";
import { compare } from "./compare";
import { fetchInventory, type FetchResult } from "./inventory";

export { isConfigured, ncloudConfig } from "./client";
export type { Comparison } from "./compare";

const KEY = "ncloud.lastSync";

export type Snapshot = FetchResult & { fetchedBy: string };

/** 마지막으로 가져온 결과 (화면을 열 때마다 API를 부르지 않도록 저장해 둔다) */
export async function lastSnapshot(): Promise<Snapshot | null> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  return row ? (JSON.parse(row.value) as Snapshot) : null;
}

export async function syncNow(by: string): Promise<Snapshot> {
  const result = await fetchInventory(ncloudConfig());
  // 전부 실패했으면 이전 결과를 지우지 않는다
  if (!result.assets.length && result.errors.length) {
    throw new Error(result.errors.join(" / "));
  }
  const snap: Snapshot = { ...result, fetchedBy: by };
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(snap) },
    update: { value: JSON.stringify(snap) },
  });
  return snap;
}

/** 저장된 네이버클라우드 결과와 현재 대장을 비교 */
export async function currentComparison(snap: Snapshot) {
  const sheets = await db.assetSheet.findMany({
    orderBy: { sortOrder: "asc" },
    include: { records: { orderBy: { sortOrder: "asc" } } },
  });
  return compare(
    snap.assets,
    sheets.map((s) => ({ id: s.id, name: s.name, columns: parseColumns(s.columns) })),
    sheets.flatMap((s) => s.records.map((r) => ({ id: r.id, sheetId: s.id, values: parseValues(r.values) }))),
  );
}

export const configured = () => isConfigured(ncloudConfig());
