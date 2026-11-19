// 자산관리대장 행의 '대표 이름'(호스트명·자산명)을 정하는 규칙. 대상 자산과 연결할 때 쓴다.
import type { AssetColumn, AssetRow } from "./workbook";

/** 시트에서 대표 이름 열: '호스트명' > '자산명' > '모델명' > 첫 번째 보이는 열 */
export function nameColumn(columns: AssetColumn[]): AssetColumn | undefined {
  const visible = columns.filter((c) => !c.hidden);
  return (
    visible.find((c) => c.label.includes("호스트명")) ??
    visible.find((c) => c.label.includes("자산명")) ??
    visible.find((c) => c.label.includes("모델명")) ??
    visible[0]
  );
}

/** 대표 이름: 첫 줄만, 앞뒤 공백 제거. 예) "steg-prod-mysql-svc\n(Master)" → "steg-prod-mysql-svc" */
export function recordName(columns: AssetColumn[], values: AssetRow): string {
  const col = nameColumn(columns);
  return (col ? values[col.col] ?? "" : "").split("\n")[0].trim();
}

/** 이름 비교용: 소문자, 끝의 괄호 설명 제거. 예) "steg-k8s-node-w-90b8(ITSM)" → "steg-k8s-node-w-90b8" */
export function nameKey(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

/** 시트 이름으로 대상 자산 유형을 짐작한다 */
export function guessKind(sheetName: string, values: AssetRow): string {
  const s = sheetName.toLowerCase();
  const text = Object.values(values).join(" ").toLowerCase();
  if (text.includes("vpn")) return "VPN";
  if (s.startsWith("db")) return text.includes("redis") ? "CACHE" : "DB";
  if (s.startsWith("os") || s.includes("kubernetes")) return "SERVER";
  return "ETC";
}
