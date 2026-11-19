import "server-only";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// 네이버클라우드(공공기관용 Gov) API 호출.
// 인증: https://api.ncloud-docs.com/docs/common-ncpapi (HMAC-SHA256 서명, x-ncp-apigw-* 헤더)
// 조회 API만 쓴다. 키는 .env의 NCLOUD_ACCESS_KEY / NCLOUD_SECRET_KEY (조회 권한만 있는 Sub Account 키 권장).

export type NcloudConfig = {
  apiUrl: string;
  regionCode: string;
  accessKey?: string;
  secretKey?: string;
  mockDir?: string; // 테스트용: {action}.json 파일로 응답을 대신한다
};

export function ncloudConfig(): NcloudConfig {
  return {
    apiUrl: (process.env.NCLOUD_API_URL || "https://ncloud.apigw.gov-ntruss.com").replace(/\/$/, ""),
    regionCode: process.env.NCLOUD_REGION || "KR",
    accessKey: process.env.NCLOUD_ACCESS_KEY || undefined,
    secretKey: process.env.NCLOUD_SECRET_KEY || undefined,
    mockDir: process.env.NCLOUD_MOCK_DIR || undefined,
  };
}

export const isConfigured = (c: NcloudConfig) => !!c.mockDir || (!!c.accessKey && !!c.secretKey);

export class NcloudError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** 서명 메시지: "{METHOD} {URI+query}\n{timestamp}\n{accessKey}" → HMAC-SHA256 → Base64 */
export function makeSignature(method: string, uri: string, timestamp: string, accessKey: string, secretKey: string) {
  return createHmac("sha256", secretKey).update(`${method} ${uri}\n${timestamp}\n${accessKey}`, "utf8").digest("base64");
}

type Json = Record<string, unknown>;

/** GET {apiUrl}{basePath}/{action}?...&responseFormatType=json */
async function call(c: NcloudConfig, basePath: string, action: string, params: Record<string, string>): Promise<Json> {
  if (c.mockDir) {
    const page = params.pageNo ?? "1";
    const file = path.join(/*turbopackIgnore: true*/ c.mockDir, `${action}${page === "1" ? "" : `.${page}`}.json`);
    try {
      return JSON.parse(await readFile(file, "utf8")) as Json;
    } catch {
      throw new NcloudError(`모의 응답 파일이 없습니다: ${path.basename(file)}`);
    }
  }
  if (!c.accessKey || !c.secretKey) throw new NcloudError("NCLOUD_ACCESS_KEY / NCLOUD_SECRET_KEY가 설정되지 않았습니다.");

  const qs = new URLSearchParams({ regionCode: c.regionCode, ...params, responseFormatType: "json" }).toString();
  const uri = `${basePath}/${action}?${qs}`;
  const timestamp = Date.now().toString();
  const res = await fetch(`${c.apiUrl}${uri}`, {
    method: "GET",
    headers: {
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": c.accessKey,
      "x-ncp-apigw-signature-v2": makeSignature("GET", uri, timestamp, c.accessKey, c.secretKey),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body: Json;
  try {
    body = JSON.parse(text) as Json;
  } catch {
    throw new NcloudError(`응답을 읽지 못했습니다 (HTTP ${res.status}): ${text.slice(0, 200)}`, res.status);
  }
  if (!res.ok) {
    const err = (body.error ?? body.responseError ?? body) as Json;
    const msg = String(err.message ?? err.returnMessage ?? err.errorMessage ?? text.slice(0, 200));
    const code = String(err.errorCode ?? "");
    // 공통 오류 코드: https://api.ncloud-docs.com/docs/common-ncpapi
    const hint =
      code === "200"
        ? " → Access Key·Secret Key가 맞는지, 공공기관용(Gov) 계정의 키인지 확인하세요."
        : code === "210"
          ? " → 이 키의 Sub Account에 해당 서비스 조회 권한이 없습니다."
          : res.status === 429
            ? " → 호출 한도를 넘었습니다. 잠시 뒤 다시 시도하세요."
            : "";
    throw new NcloudError(`${action}: ${msg} (HTTP ${res.status}${code ? `, 코드 ${code}` : ""})${hint}`, res.status);
  }
  return body;
}

/** 목록 API를 페이지 단위로 끝까지 읽는다 */
export async function listAll<T>(
  c: NcloudConfig,
  basePath: string,
  action: string,
  listField: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 100;
  for (let pageNo = 1; pageNo <= 100; pageNo++) {
    const body = await call(c, basePath, action, { ...params, pageNo: String(pageNo), pageSize: String(pageSize) });
    const wrap = (body[`${action}Response`] ?? body) as Json;
    if (wrap.returnCode !== undefined && String(wrap.returnCode) !== "0")
      throw new NcloudError(`${action}: ${String(wrap.returnMessage ?? "실패")} (코드 ${String(wrap.returnCode)})`);
    const items = (wrap[listField] ?? []) as T[];
    out.push(...items);
    const total = Number(wrap.totalRows ?? out.length);
    if (items.length < pageSize || out.length >= total) break;
  }
  return out;
}
