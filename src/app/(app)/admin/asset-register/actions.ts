"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import {
  autoLinkAssets,
  guessKind,
  importRegister,
  parseColumns,
  parseValues,
  recordName,
  syncAssetName,
  type AssetRow,
} from "@/lib/asset-register";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export type Result = { ok?: boolean; error?: string; message?: string };

const PAGE = "/admin/asset-register";
const TARGETS = "/admin/assets";
const MAX_BYTES = 20 * 1024 * 1024;

export async function uploadTemplate(_: Result | undefined, form: FormData): Promise<Result> {
  const admin = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "xlsx 파일을 선택하세요." };
  if (!/\.xlsx$/i.test(file.name)) return { error: "xlsx 파일만 올릴 수 있습니다." };
  if (file.size > MAX_BYTES) return { error: "20MB를 넘는 파일은 올릴 수 없습니다." };
  if (form.get("confirm") !== "yes") return { error: "기존 자산 데이터를 바꾼다는 확인란을 체크하세요." };

  try {
    const r = await importRegister(Buffer.from(await file.arrayBuffer()), file.name, admin.name);
    await audit({ id: admin.id, name: admin.name }, "asset_register.imported", undefined, { name: file.name, ...r });
    revalidatePath(PAGE);
    revalidatePath(TARGETS);
    const miss = r.unmatched.length ? ` 대장에서 찾지 못한 점검 대상 ${r.unmatched.length}개: ${r.unmatched.join(", ")}` : "";
    return {
      ok: true,
      message: `${file.name}: 시트 ${r.sheets}개, 자산 ${r.records}건을 가져왔습니다. 점검 대상 ${r.linked}개를 연결했습니다.${miss}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "파일을 읽지 못했습니다." };
  }
}

/** 시트 열 정의에 있는 열만, 앞뒤 공백을 정리해 저장한다 */
function clean(columns: { col: string }[], input: AssetRow): AssetRow {
  const out: AssetRow = {};
  for (const { col } of columns) {
    const v = String(input[col] ?? "").replace(/\r\n/g, "\n").trim();
    if (v) out[col] = v;
  }
  return out;
}

export async function saveRecord(sheetId: string, recordId: string | null, input: AssetRow): Promise<Result> {
  const admin = await requireAdmin();
  const sheet = await db.assetSheet.findUnique({ where: { id: sheetId } });
  if (!sheet) return { error: "시트를 찾을 수 없습니다." };
  const values = clean(parseColumns(sheet.columns), input);
  if (!Object.keys(values).length) return { error: "값을 하나 이상 입력하세요." };

  if (recordId) {
    const before = await db.assetRecord.findUnique({ where: { id: recordId } });
    if (!before || before.sheetId !== sheetId) return { error: "행을 찾을 수 없습니다." };
    await db.assetRecord.update({ where: { id: recordId }, data: { values: JSON.stringify(values) } });
    // 호스트명 등 대표 이름이 바뀌면 연결된 점검 대상 이름도 따라 바꾼다 (다음 회차부터 반영)
    const cols = parseColumns(sheet.columns);
    const renamed = await syncAssetName(recordId, recordName(cols, parseValues(before.values)), recordName(cols, values));
    await audit({ id: admin.id, name: admin.name }, "asset_register.record_updated", { type: "asset_record", id: recordId }, {
      sheet: sheet.name,
      before: parseValues(before.values),
      after: values,
      ...(renamed ? { targetRenamed: renamed } : {}),
    });
    if (renamed) revalidatePath(TARGETS);
  } else {
    const max = await db.assetRecord.aggregate({ where: { sheetId }, _max: { sortOrder: true } });
    const rec = await db.assetRecord.create({
      data: { sheetId, values: JSON.stringify(values), sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    await audit({ id: admin.id, name: admin.name }, "asset_register.record_created", { type: "asset_record", id: rec.id }, {
      sheet: sheet.name,
      values,
    });
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function deleteRecord(recordId: string): Promise<Result> {
  const admin = await requireAdmin();
  const rec = await db.assetRecord.findUnique({ where: { id: recordId }, include: { sheet: true, target: true } });
  if (!rec) return { error: "행을 찾을 수 없습니다." };
  // 연결된 점검 대상은 지우지 않고 연결만 끊긴다 (대상 자산 화면에 '대장에 없음'으로 표시)
  await db.assetRecord.delete({ where: { id: recordId } });
  // 삭제한 값은 감사 로그에 남겨 언제든 확인할 수 있게 한다
  await audit({ id: admin.id, name: admin.name }, "asset_register.record_deleted", { type: "asset_record", id: recordId }, {
    sheet: rec.sheet.name,
    values: parseValues(rec.values),
    ...(rec.target ? { unlinkedTarget: rec.target.name } : {}),
  });
  revalidatePath(PAGE);
  if (rec.target) revalidatePath(TARGETS);
  return { ok: true };
}

// ── 대상 자산 연결 ─────────────────────────────────

/**
 * 대장 행을 접근권한 점검 대상으로 지정한다.
 * 같은 이름의 대상 자산이 이미 있으면 그 자산에 연결하고, 없으면 새로 만든다.
 */
export async function markTarget(recordId: string): Promise<Result> {
  const admin = await requireAdmin();
  const rec = await db.assetRecord.findUnique({ where: { id: recordId }, include: { sheet: true, target: true } });
  if (!rec) return { error: "행을 찾을 수 없습니다." };
  if (rec.target) return { error: `이미 점검 대상(${rec.target.name})과 연결되어 있습니다.` };
  const values = parseValues(rec.values);
  const name = recordName(parseColumns(rec.sheet.columns), values);
  if (!name) return { error: "호스트명·자산명이 비어 있어 점검 대상으로 지정할 수 없습니다." };

  const existing = await db.asset.findUnique({ where: { name } });
  if (existing?.recordId) return { error: `'${name}' 점검 대상은 이미 다른 행과 연결되어 있습니다.` };
  let asset;
  if (existing) {
    const tags = existing.tags.split(",").map((t) => t.trim()).filter(Boolean);
    asset = await db.asset.update({
      where: { id: existing.id },
      data: { recordId, active: true, tags: [...new Set([...tags, "access-review"])].join(",") },
    });
  } else {
    const max = await db.asset.aggregate({ _max: { sortOrder: true } });
    asset = await db.asset.create({
      data: {
        name,
        kind: guessKind(rec.sheet.name, values),
        tags: "access-review",
        recordId,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
  }
  await audit({ id: admin.id, name: admin.name }, existing ? "asset.linked" : "asset.created", { type: "asset", id: asset.id }, {
    name,
    sheet: rec.sheet.name,
    recordId,
  });
  revalidatePath(PAGE);
  revalidatePath(TARGETS);
  return { ok: true, message: `${name}을(를) 점검 대상으로 지정했습니다. 다음 회차부터 반영됩니다.` };
}

/** 대상 자산 화면에서 대장 행을 직접 고르거나(recordId) 연결을 끊는다(null) */
export async function linkTarget(assetId: string, recordId: string | null): Promise<Result> {
  const admin = await requireAdmin();
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset) return { error: "대상 자산을 찾을 수 없습니다." };
  if (recordId) {
    const other = await db.asset.findUnique({ where: { recordId } });
    if (other && other.id !== assetId) return { error: `그 행은 이미 '${other.name}'과(와) 연결되어 있습니다.` };
    if (!(await db.assetRecord.findUnique({ where: { id: recordId } }))) return { error: "대장 행을 찾을 수 없습니다." };
  }
  await db.asset.update({ where: { id: assetId }, data: { recordId } });
  await audit({ id: admin.id, name: admin.name }, recordId ? "asset.linked" : "asset.unlinked", { type: "asset", id: assetId }, {
    name: asset.name,
    recordId,
  });
  revalidatePath(PAGE);
  revalidatePath(TARGETS);
  return { ok: true };
}

export async function runAutoLink(): Promise<Result> {
  const admin = await requireAdmin();
  const r = await autoLinkAssets();
  await audit({ id: admin.id, name: admin.name }, "asset.auto_linked", undefined, r);
  revalidatePath(PAGE);
  revalidatePath(TARGETS);
  return {
    ok: true,
    message:
      `${r.linked.length}개를 연결했습니다.` +
      (r.unmatched.length ? ` 대장에서 찾지 못한 대상: ${r.unmatched.join(", ")}` : ""),
  };
}

export async function moveRecord(recordId: string, dir: -1 | 1): Promise<Result> {
  const admin = await requireAdmin();
  const rec = await db.assetRecord.findUnique({ where: { id: recordId } });
  if (!rec) return { error: "행을 찾을 수 없습니다." };
  const list = await db.assetRecord.findMany({ where: { sheetId: rec.sheetId }, orderBy: { sortOrder: "asc" } });
  const i = list.findIndex((r) => r.id === recordId);
  const j = i + dir;
  if (j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  await db.$transaction(list.map((r, k) => db.assetRecord.update({ where: { id: r.id }, data: { sortOrder: k } })));
  await audit({ id: admin.id, name: admin.name }, "asset_register.record_moved", { type: "asset_record", id: recordId }, {
    from: i + 1,
    to: j + 1,
  });
  revalidatePath(PAGE);
  return { ok: true };
}
