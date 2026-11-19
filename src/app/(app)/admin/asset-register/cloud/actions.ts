"use server";

import { revalidatePath } from "next/cache";
import { parseColumns, parseValues, type AssetRow } from "@/lib/asset-register";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { configured, syncNow } from "@/lib/ncloud";

export type Result = { ok?: boolean; error?: string; message?: string };

const PAGE = "/admin/asset-register/cloud";
const REGISTER = "/admin/asset-register";

export async function syncCloud(): Promise<Result> {
  const admin = await requireAdmin();
  if (!configured()) return { error: "네이버클라우드 API 키가 설정되지 않았습니다." };
  try {
    const snap = await syncNow(admin.name);
    await audit({ id: admin.id, name: admin.name }, "ncloud.fetched", undefined, {
      assets: snap.assets.length,
      errors: snap.errors,
    });
    revalidatePath(PAGE);
    return {
      ok: true,
      message:
        `자산 ${snap.assets.length}개를 가져왔습니다.` +
        (snap.errors.length ? ` 일부 실패: ${snap.errors.join(" / ")}` : ""),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit({ id: admin.id, name: admin.name }, "ncloud.fetch_failed", undefined, { error: msg });
    return { error: `가져오지 못했습니다: ${msg}` };
  }
}

/** 대장 행의 일부 열을 네이버클라우드 값으로 바꾼다 */
export async function applyCloudValues(recordId: string, changes: { col: string; value: string }[]): Promise<Result> {
  const admin = await requireAdmin();
  const rec = await db.assetRecord.findUnique({ where: { id: recordId }, include: { sheet: true } });
  if (!rec) return { error: "대장 행을 찾을 수 없습니다. 화면을 새로 고치세요." };
  const cols = new Set(parseColumns(rec.sheet.columns).map((c) => c.col));
  const before = parseValues(rec.values);
  const after: AssetRow = { ...before };
  for (const { col, value } of changes) {
    if (!cols.has(col)) continue;
    // 칸에 여러 줄이 있으면 첫 줄만 바꾸고 나머지 설명은 남긴다 (예: "IP\n(비고)")
    const rest = (before[col] ?? "").split("\n").slice(1);
    const v = [value, ...rest].join("\n").trim();
    if (v) after[col] = v;
    else delete after[col];
  }
  await db.assetRecord.update({ where: { id: recordId }, data: { values: JSON.stringify(after) } });
  await audit({ id: admin.id, name: admin.name }, "asset_register.cloud_applied", { type: "asset_record", id: recordId }, {
    sheet: rec.sheet.name,
    before,
    after,
  });
  revalidatePath(PAGE);
  revalidatePath(REGISTER);
  return { ok: true };
}

/** 네이버클라우드에만 있는 자산을 대장에 추가 */
export async function addFromCloud(sheetId: string, values: AssetRow, cloudId: string): Promise<Result> {
  const admin = await requireAdmin();
  const sheet = await db.assetSheet.findUnique({ where: { id: sheetId } });
  if (!sheet) return { error: "시트를 찾을 수 없습니다." };
  const cols = new Set(parseColumns(sheet.columns).map((c) => c.col));
  const clean: AssetRow = {};
  for (const [k, v] of Object.entries(values)) if (cols.has(k) && v.trim()) clean[k] = v.trim();
  if (!Object.keys(clean).length) return { error: "넣을 값이 없습니다." };
  const max = await db.assetRecord.aggregate({ where: { sheetId }, _max: { sortOrder: true } });
  const rec = await db.assetRecord.create({
    data: { sheetId, values: JSON.stringify(clean), sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  await audit({ id: admin.id, name: admin.name }, "asset_register.cloud_added", { type: "asset_record", id: rec.id }, {
    sheet: sheet.name,
    cloudId,
    values: clean,
  });
  revalidatePath(PAGE);
  revalidatePath(REGISTER);
  return { ok: true, message: `${sheet.name} 시트에 추가했습니다. 관리부서·운용자·용도는 대장에서 입력하세요.` };
}
