import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const STORAGE_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./data/evidence");
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ALLOWED = /\.(png|jpe?g|gif|webp|bmp|pdf|xlsx?|docx?|pptx?|hwpx?|txt|csv|log|zip)$/i;

export function checkFile(f: File): string | null {
  if (f.size === 0) return `${f.name}: 빈 파일입니다.`;
  if (f.size > MAX_FILE_BYTES) return `${f.name}: 20MB를 넘습니다.`;
  if (!ALLOWED.test(f.name)) return `${f.name}: 허용되지 않는 형식입니다.`;
  return null;
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 80);

/** 파일 저장 후 상대 경로·해시 반환. 파일명 규칙: {슬롯}_{제목}_{기간}_{시각}.{확장자} */
export async function storeEvidence(opts: {
  file: File;
  period: string;
  runId: string;
  slotKey: string;
  slotTitle: string;
}) {
  const buf = Buffer.from(await opts.file.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const ext = path.extname(opts.file.name).toLowerCase();
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const storedName = `${safe(opts.slotKey)}_${safe(opts.slotTitle)}_${opts.period}_${stamp}_${sha256.slice(0, 6)}${ext}`;
  const rel = path.join(opts.period, opts.runId, storedName);
  const abs = path.join(/*turbopackIgnore: true*/ STORAGE_DIR, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf, { flag: "wx" });
  return { storedName, storagePath: rel.split(path.sep).join("/"), sha256, size: buf.length };
}

export async function readEvidence(storagePath: string) {
  const abs = path.resolve(/*turbopackIgnore: true*/ STORAGE_DIR, storagePath);
  if (!abs.startsWith(STORAGE_DIR + path.sep)) throw new Error("invalid path");
  return readFile(abs);
}

export const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};
