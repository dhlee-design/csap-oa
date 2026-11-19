// 자산관리대장(STEG_CSAP_041) xlsx 읽기·쓰기.
// 양식 파일 자체를 템플릿으로 보관하고, 내보낼 때 각 시트의 데이터 행만 현재 값으로 바꿔 쓴다.
// 그래서 표지·제목·머리글·병합·열 너비·서식은 올린 파일과 같다.
// DB 접근 없이 버퍼만 다루므로 스크립트에서도 쓸 수 있다.
import ExcelJS from "exceljs";

export type AssetColumnType = "text" | "date" | "number";

export type AssetColumn = {
  col: string; // 열 문자 (예: B)
  label: string; // 머리글 (줄바꿈은 공백으로)
  group: string; // 머리글 위 묶음 (예: 자산상세내역, 관리형태)
  type: AssetColumnType;
  hidden?: boolean; // 양식에서 숨긴 열
};

export type AssetSheetDef = {
  name: string;
  title: string;
  category: string;
  description: string;
  headerRow: number;
  numberCol: string;
  columns: AssetColumn[];
};

export type AssetRow = Record<string, string>;

export type ParsedSheet = AssetSheetDef & { records: AssetRow[] };

const NUMBER_HEADER = "번호";
const HEADER_SCAN_ROWS = 30;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** 셀 값을 화면·DB용 문자열로 바꾼다. 날짜는 yyyy-mm-dd. */
export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return ymd(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("formula" in v || "sharedFormula" in v) return cellText((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text ?? "");
    if ("error" in v) return "";
  }
  return String(v);
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colNumber(letter: string): number {
  return [...letter].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

/** '번호' 머리글 위치 */
function findHeader(ws: ExcelJS.Worksheet): { row: number; col: number } | null {
  for (let r = 1; r <= Math.min(ws.rowCount, HEADER_SCAN_ROWS); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.max(row.cellCount, 1); c++) {
      if (oneLine(cellText(row.getCell(c).value)) === NUMBER_HEADER) return { row: r, col: c };
    }
  }
  return null;
}

/** 머리글 위쪽에서 라벨 바로 오른쪽 값을 찾는다 (예: 자산분류 → 서버시스템) */
function labelValue(ws: ExcelJS.Worksheet, label: string, beforeRow: number): string {
  for (let r = 1; r < beforeRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      if (oneLine(cellText(row.getCell(c).value)) !== label) continue;
      for (let k = c + 1; k <= row.cellCount; k++) {
        const t = cellText(row.getCell(k).value).trim();
        if (t && t !== label) return t;
      }
    }
  }
  return "";
}

function lastValueRow(ws: ExcelJS.Worksheet, from: number): number {
  let last = from - 1;
  for (let r = from; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    let has = false;
    row.eachCell({ includeEmpty: false }, (c) => {
      if (cellText(c.value).trim()) has = true;
    });
    if (has) last = r;
  }
  return last;
}

/** 양식 파일에서 시트별 열 정의와 현재 데이터를 읽는다 */
export async function parseWorkbook(buf: Buffer | ArrayBuffer): Promise<ParsedSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const out: ParsedSheet[] = [];

  for (const ws of wb.worksheets) {
    const h = findHeader(ws);
    if (!h) continue; // 표지 등 목록이 아닌 시트

    const header = ws.getRow(h.row);
    const above = ws.getRow(h.row - 1);
    const maxCol = Math.max(header.cellCount, ws.columnCount);
    const columns: AssetColumn[] = [];
    for (let c = 1; c <= maxCol; c++) {
      if (c === h.col) continue;
      const label = oneLine(cellText(header.getCell(c).value));
      if (!label) continue;
      const g = oneLine(cellText(above.getCell(c).value));
      columns.push({
        col: colLetter(c),
        label,
        group: g && g !== label && g !== "null" && g !== "구분" ? g : "",
        type: "text",
        ...(ws.getColumn(c).hidden ? { hidden: true } : {}),
      });
    }

    const first = h.row + 1;
    const last = lastValueRow(ws, first);
    const records: AssetRow[] = [];
    const sawDate = new Set<string>();
    const nonNumber = new Set<string>();
    for (let r = first; r <= last; r++) {
      const row = ws.getRow(r);
      const rec: AssetRow = {};
      for (const col of columns) {
        const v = row.getCell(col.col).value;
        const t = cellText(v);
        if (!t.trim()) continue;
        rec[col.col] = t;
        if (v instanceof Date) sawDate.add(col.col);
        if (typeof v !== "number") nonNumber.add(col.col);
      }
      if (Object.keys(rec).length) records.push(rec);
    }
    for (const col of columns) {
      if (sawDate.has(col.col)) col.type = "date";
      else if (records.some((r) => r[col.col]) && !nonNumber.has(col.col)) col.type = "number";
    }

    // 제목: 머리글 위쪽 첫 번째 값
    let title = "";
    for (let r = 1; r < h.row && !title; r++) {
      ws.getRow(r).eachCell({ includeEmpty: false }, (c) => {
        if (!title) title = oneLine(cellText(c.value));
      });
    }

    out.push({
      name: ws.name,
      title: title || ws.name,
      category: labelValue(ws, "자산분류", h.row),
      description: labelValue(ws, "Description", h.row),
      headerRow: h.row,
      numberCol: colLetter(h.col),
      columns,
      records,
    });
  }
  return out;
}

// 엑셀에 직접 입력했을 때 숫자로 바뀌는 형태만 숫자로 쓴다 (앞자리 0, IP 같은 값은 문자 유지)
const NUMERIC_RE = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;

/** 값 쓰기: 날짜 열은 날짜로, 텍스트(@) 서식이 아닌 칸의 숫자 형태는 숫자로 (엑셀에 직접 입력한 것과 같게) */
function typed(v: string | undefined, type: AssetColumnType, numFmt: string | undefined): ExcelJS.CellValue {
  if (v === undefined || v === "") return null;
  const t = v.trim();
  if (type === "date") {
    const m = DATE_RE.exec(t);
    if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  if (numFmt !== "@" && NUMERIC_RE.test(t)) return Number(t);
  return v;
}

/**
 * 양식 파일에 현재 데이터를 채워 새 xlsx를 만든다.
 * - 시트 이름으로 찾고, '번호' 행 아래 데이터 영역의 값만 다시 쓴다.
 * - 양식에 있던 행은 그 행의 서식을 그대로 두고, 늘어난 행은 양식의 마지막 데이터 행 서식(테두리·글꼴·정렬·표시 형식·높이)을 복사한다.
 * - 줄어든 행은 값과 서식을 지운다. 번호는 1부터 다시 매긴다.
 */
export async function fillWorkbook(
  template: Buffer | ArrayBuffer,
  sheets: (Pick<AssetSheetDef, "name" | "headerRow" | "numberCol" | "columns"> & { records: AssetRow[] })[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template as ArrayBuffer);

  for (const s of sheets) {
    const ws = wb.getWorksheet(s.name);
    if (!ws) continue;
    const first = s.headerRow + 1;
    const oldLast = lastValueRow(ws, first);
    const maxCol = Math.max(
      ws.getRow(s.headerRow).cellCount,
      colNumber(s.numberCol),
      ...s.columns.map((c) => colNumber(c.col)),
    );

    // 늘어난 행에 쓸 서식: 양식의 마지막 데이터 행 (데이터가 없던 양식이면 머리글 바로 아래 행)
    const base = ws.getRow(Math.max(oldLast, first));
    const baseHeight = base.height;
    const baseStyles = Array.from({ length: maxCol }, (_, i) => structuredClone(base.getCell(i + 1).style ?? {}));

    // 기존 데이터 영역 값 비우기 (서식은 유지)
    for (let r = first; r <= oldLast; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= maxCol; c++) row.getCell(c).value = null;
    }

    const numberIdx = colNumber(s.numberCol);
    s.records.forEach((rec, i) => {
      const r = first + i;
      const row = ws.getRow(r);
      if (r > oldLast) {
        if (baseHeight) row.height = baseHeight;
        for (let c = 1; c <= maxCol; c++) row.getCell(c).style = structuredClone(baseStyles[c - 1]);
      }
      row.getCell(numberIdx).value = i + 1;
      for (const col of s.columns) {
        const cell = row.getCell(col.col);
        cell.value = typed(rec[col.col], col.type, cell.numFmt);
        // 칸 안 줄바꿈이 엑셀에서 보이도록 해당 칸만 '텍스트 줄 바꿈'을 켠다
        // exceljs는 같은 서식의 셀끼리 style 객체를 공유하므로, 복사본을 만들어 이 칸에만 적용한다
        if (rec[col.col]?.includes("\n") && !cell.alignment?.wrapText) {
          const style = structuredClone(cell.style ?? {});
          cell.style = { ...style, alignment: { ...(style.alignment ?? {}), wrapText: true } };
        }
      }
    });

    // 데이터가 줄어 남은 행은 서식까지 지워 빈 표가 남지 않게 한다
    for (let r = first + s.records.length; r <= oldLast; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= maxCol; c++) row.getCell(c).style = {};
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
