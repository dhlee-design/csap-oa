// 네이버클라우드 자산 ↔ 자산관리대장 비교 (순수 함수, DB 접근 없음)
import { nameColumn, nameKey, recordName } from "../asset-register/keys";
import type { AssetColumn, AssetRow } from "../asset-register/workbook";
import type { CloudAsset } from "./types";

export type SheetIn = { id: string; name: string; columns: AssetColumn[] };
export type RecordIn = { id: string; sheetId: string; values: AssetRow };

export type FieldKey = "ip" | "extraIp" | "os" | "version" | "createDate";
export const FIELD_LABEL: Record<FieldKey, string> = {
  ip: "IP",
  extraIp: "추가 IP",
  os: "OS",
  version: "버전",
  createDate: "도입일",
};

export type Diff = { field: FieldKey; col: string; label: string; register: string; cloud: string; note?: string };
export type MatchedRow = { record: RecordIn; sheet: SheetIn; recordName: string; diffs: Diff[] };
export type Matched = { asset: CloudAsset; rows: MatchedRow[] };
export type CloudOnly = { asset: CloudAsset; sheetId: string | null; values: AssetRow };
export type RegisterOnly = { record: RecordIn; sheet: SheetIn; recordName: string };

export type Comparison = {
  matched: Matched[];
  cloudOnly: CloudOnly[];
  registerOnly: RegisterOnly[];
  comparedSheets: SheetIn[];
};

type SheetRole = "server" | "db";

/** 비교 대상 시트: OS·Kubernetes 시트는 서버, DB 시트는 Cloud DB */
export function sheetRole(name: string): SheetRole | null {
  const n = name.toLowerCase();
  if (n.startsWith("os") || n.includes("kubernetes")) return "server";
  if (n.startsWith("db")) return "db";
  return null;
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 시트에서 비교할 열 찾기 (머리글 이름 기준) */
export function fieldColumns(sheet: SheetIn): Partial<Record<FieldKey | "name" | "location" | "hw" | "kind", AssetColumn>> {
  const cols = sheet.columns.filter((c) => !c.hidden);
  const by = (pred: (l: string) => boolean) => cols.find((c) => pred(norm(c.label)));
  return {
    name: nameColumn(sheet.columns),
    ip: by((l) => l === "ip"),
    extraIp: by((l) => l.includes("추가ip")),
    os: by((l) => l === "os" || l === "(pod)os"),
    version: by((l) => l === "os버전" || l === "db버전"),
    createDate: by((l) => l.startsWith("도입일")),
    location: by((l) => l.startsWith("위치")),
    hw: by((l) => l.startsWith("vm/hardware")),
    kind: by((l) => l.startsWith("dbms명")),
  };
}

function roleOf(text: string): "master" | "standby" | "slave" | "" {
  const t = text.toLowerCase();
  if (t.includes("standby")) return "standby";
  if (t.includes("slave") || t.includes("recovery")) return "slave";
  if (t.includes("master") || t.includes("active")) return "master";
  return "";
}

const first = (s?: string) => (s ?? "").split("\n")[0].trim();

/** 버전 비교: 점으로 나눈 각 자리를 숫자로 비교 (숫자가 아니면 글자 그대로) */
export function sameVersion(a: string, b: string): boolean {
  const parts = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p.toLowerCase()));
  return parts(a).join(".") === parts(b).join(".");
}
const empty = (s: string) => !s || s === "-";

function diffsFor(asset: CloudAsset, sheet: SheetIn, values: AssetRow): Diff[] {
  const f = fieldColumns(sheet);
  const out: Diff[] = [];
  const push = (field: FieldKey, col: AssetColumn | undefined, register: string, cloud: string, note?: string) => {
    if (!col) return;
    out.push({ field, col: col.col, label: col.label, register, cloud, ...(note ? { note } : {}) });
  };

  // IP: 서버는 사설 IP, DB는 접속 도메인
  const cloudIp = asset.kind === "server" ? asset.privateIp : asset.domain || asset.privateIp;
  const regIp = first(values[f.ip?.col ?? ""]);
  if (f.ip && cloudIp && regIp !== cloudIp) push("ip", f.ip, regIp, cloudIp);

  // 추가 IP: 공인 IP 또는 보조 인터페이스 IP 중 하나와 맞으면 일치로 본다
  if (f.extraIp && asset.kind === "server") {
    const reg = first(values[f.extraIp.col]);
    const cloudSet = [asset.publicIp, ...asset.extraIps].filter(Boolean);
    const cloudText = cloudSet.join(", ");
    if (empty(reg) ? cloudSet.length > 0 : !cloudSet.includes(reg)) push("extraIp", f.extraIp, reg, cloudText || "(없음)");
  }

  // 버전: 서버는 이미지 코드로 추정한 값이라 참고용. 22.04 = 22.4, 9.06 = 9.6 처럼 숫자로 비교한다
  const regVer = first(values[f.version?.col ?? ""]);
  if (f.version && asset.osVersion && regVer && !sameVersion(regVer, asset.osVersion))
    push("version", f.version, regVer, asset.osVersion, asset.kind === "server" ? "이미지 코드로 추정한 값" : undefined);

  // 도입일: 네이버클라우드 생성일과 비교 (도입일을 다르게 관리한다면 무시해도 된다)
  const regDate = first(values[f.createDate?.col ?? ""]);
  if (f.createDate && asset.createDate && regDate !== asset.createDate)
    push("createDate", f.createDate, regDate, asset.createDate, "네이버클라우드 생성일");

  return out;
}

/** 네이버클라우드 OS 이름을 대장 표기에 맞춘다. 예) "Ubuntu Server 64 Bit" → "ubuntu", "Rocky Linux 64 Bit" → "Rocky Linux" */
export function simpleOs(name: string): string {
  if (/ubuntu/i.test(name)) return "ubuntu";
  return name.replace(/\b(64|32)\s*Bit\b/gi, "").replace(/\bServer\b/gi, "").replace(/\s+/g, " ").trim();
}

/** 대장에 새로 넣을 때 쓸 값 (기존 행 표기 방식에 맞춘다) */
export function newRowValues(asset: CloudAsset, sheet: SheetIn): AssetRow {
  const f = fieldColumns(sheet);
  const v: AssetRow = {};
  const set = (col: AssetColumn | undefined, val: string) => {
    if (col && val) v[col.col] = val;
  };
  if (asset.kind === "server") {
    set(f.name, asset.name);
    set(f.hw, "VM");
    set(f.ip, asset.privateIp);
    set(f.extraIp, asset.publicIp || asset.extraIps.join(", "));
    set(f.os, simpleOs(asset.os));
    set(f.version, asset.osVersion);
    set(f.location, "네이버클라우드");
  } else {
    set(f.kind, asset.kind === "mysql" ? "MYSQL" : "REDIS");
    set(f.name, asset.role ? `${asset.name}\n(${asset.role})` : asset.name);
    set(f.ip, asset.domain || asset.privateIp);
    set(f.version, asset.osVersion);
    set(f.location, `네이버클라우드\n(${asset.kind === "mysql" ? "Cloud DB for MySQL" : "Cloud DB for Cache"})`);
  }
  set(f.createDate, asset.createDate);
  return v;
}

export function compare(assets: CloudAsset[], sheets: SheetIn[], records: RecordIn[]): Comparison {
  const comparedSheets = sheets.filter((s) => sheetRole(s.name));
  const sheetById = new Map(sheets.map((s) => [s.id, s]));
  const rows = records
    .filter((r) => {
      const s = sheetById.get(r.sheetId);
      return s && sheetRole(s.name);
    })
    .map((r) => {
      const sheet = sheetById.get(r.sheetId)!;
      const full = (sheet && r.values[nameColumn(sheet.columns)?.col ?? ""]) ?? "";
      return { record: r, sheet, role: sheetRole(sheet.name)!, name: recordName(sheet.columns, r.values), roleHint: roleOf(full) };
    })
    .filter((r) => r.name);

  const used = new Set<string>();
  const matched: Matched[] = [];
  const cloudOnly: CloudOnly[] = [];

  for (const asset of assets) {
    const want: SheetRole = asset.kind === "server" ? "server" : "db";
    const pool = rows.filter((r) => r.role === want && !used.has(r.record.id));
    let hits = pool.filter((r) => nameKey(r.name) === nameKey(asset.name));
    // DB는 대장에 서비스 이름 + (Master)/(Standby) 로 적는 경우가 있다 → 역할로 고른다
    if (!hits.length && asset.service) {
      const bySvc = pool.filter((r) => nameKey(r.name) === nameKey(asset.service!));
      const role = roleOf(asset.role ?? "");
      hits = bySvc.filter((r) => r.roleHint === role).slice(0, 1);
      if (!hits.length && bySvc.length === 1) hits = bySvc;
    }
    if (!hits.length) {
      const target = comparedSheets.find((s) => sheetRole(s.name) === want && !s.name.toLowerCase().includes("kubernetes"));
      cloudOnly.push({ asset, sheetId: target?.id ?? null, values: target ? newRowValues(asset, target) : {} });
      continue;
    }
    // 서버는 같은 호스트가 OS·Kubernetes 시트 양쪽에 있을 수 있어 모두 비교한다
    const chosen = want === "server" ? hits : hits.slice(0, 1);
    chosen.forEach((h) => used.add(h.record.id));
    matched.push({
      asset,
      rows: chosen.map((h) => ({ record: h.record, sheet: h.sheet, recordName: h.name, diffs: diffsFor(asset, h.sheet, h.record.values) })),
    });
  }

  const registerOnly = rows
    .filter((r) => !used.has(r.record.id))
    .map((r) => ({ record: r.record, sheet: r.sheet, recordName: r.name }));

  return { matched, cloudOnly, registerOnly, comparedSheets };
}
