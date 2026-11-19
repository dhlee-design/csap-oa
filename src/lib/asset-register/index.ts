import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { autoLinkAssets } from "./link";
import { fillWorkbook, parseWorkbook, type AssetColumn, type AssetRow } from "./workbook";

export type { AssetColumn, AssetRow } from "./workbook";
export { allRecords, autoLinkAssets, syncAssetName } from "./link";
export { guessKind, nameKey, recordName } from "./keys";

// 양식 파일 보관 위치 (data/ 아래라 git에 올라가지 않는다. DB·증적과 함께 백업 대상)
export const FORMS_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.FORMS_DIR ?? "./data/forms");
const TEMPLATE_PATH = path.join(/*turbopackIgnore: true*/ FORMS_DIR, "asset-register.xlsx");
const META_KEY = "assetRegister.template";

export type TemplateMeta = { originalName: string; sha256: string; size: number; uploadedAt: string; uploadedBy: string };

export const parseColumns = (s: string) => JSON.parse(s) as AssetColumn[];
export const parseValues = (s: string) => JSON.parse(s) as AssetRow;

export async function templateMeta(): Promise<TemplateMeta | null> {
  const row = await db.setting.findUnique({ where: { key: META_KEY } });
  if (!row) return null;
  try {
    await stat(TEMPLATE_PATH);
  } catch {
    return null; // 설정은 있는데 파일이 없어진 경우
  }
  return JSON.parse(row.value) as TemplateMeta;
}

/**
 * 양식 파일을 올린다. 파일을 양식으로 보관하고, 시트별 열 정의와 데이터를 DB에 새로 넣는다.
 * 기존 자산 데이터는 모두 바뀐다.
 */
export async function importRegister(buf: Buffer, originalName: string, by: string) {
  const sheets = await parseWorkbook(buf);
  if (!sheets.length) throw new Error("'번호' 머리글이 있는 자산 목록 시트를 찾지 못했습니다. 자산관리대장 양식인지 확인하세요.");

  await db.$transaction(async (tx) => {
    await tx.assetSheet.deleteMany();
    for (const [i, s] of sheets.entries()) {
      await tx.assetSheet.create({
        data: {
          name: s.name,
          title: s.title,
          category: s.category,
          description: s.description,
          headerRow: s.headerRow,
          numberCol: s.numberCol,
          columns: JSON.stringify(s.columns),
          sortOrder: i,
          records: {
            create: s.records.map((values, j) => ({ values: JSON.stringify(values), sortOrder: j })),
          },
        },
      });
    }
    const meta: TemplateMeta = {
      originalName,
      sha256: createHash("sha256").update(buf).digest("hex"),
      size: buf.length,
      uploadedAt: new Date().toISOString(),
      uploadedBy: by,
    };
    await tx.setting.upsert({
      where: { key: META_KEY },
      create: { key: META_KEY, value: JSON.stringify(meta) },
      update: { value: JSON.stringify(meta) },
    });
  });

  // DB 반영이 끝난 뒤 파일 교체 (임시 파일에 쓰고 바꿔치기)
  await mkdir(FORMS_DIR, { recursive: true });
  const tmp = `${TEMPLATE_PATH}.${Date.now()}.tmp`;
  await writeFile(tmp, buf);
  await rename(tmp, TEMPLATE_PATH);

  // 행을 새로 만들었으므로 대상 자산 연결이 끊겼다 → 이름으로 다시 연결
  const link = await autoLinkAssets();

  return {
    sheets: sheets.length,
    records: sheets.reduce((n, s) => n + s.records.length, 0),
    linked: link.linked.length,
    unmatched: link.unmatched,
  };
}

/** 현재 DB 값을 양식 파일에 채운 xlsx */
export async function exportRegister(): Promise<Buffer> {
  const template = await readFile(TEMPLATE_PATH);
  const sheets = await db.assetSheet.findMany({
    orderBy: { sortOrder: "asc" },
    include: { records: { orderBy: { sortOrder: "asc" } } },
  });
  return fillWorkbook(
    template,
    sheets.map((s) => ({
      name: s.name,
      headerRow: s.headerRow,
      numberCol: s.numberCol,
      columns: parseColumns(s.columns),
      records: s.records.map((r) => parseValues(r.values)),
    })),
  );
}

/** 다운로드 파일명: 올린 파일명 뒤에 내려받은 날짜를 붙인다 */
export function exportFileName(meta: TemplateMeta | null, now = new Date()): string {
  const base = (meta?.originalName ?? "자산관리대장.xlsx").replace(/\.xlsx$/i, "");
  const p = (n: number) => String(n).padStart(2, "0");
  return `${base}_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.xlsx`;
}
