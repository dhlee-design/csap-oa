import "server-only";
import { getList, listAll, ncloudConfig, type NcloudConfig } from "./client";
import type { CloudAsset } from "./types";

type Code = { code?: string; codeName?: string };
type Server = {
  serverInstanceNo: string;
  serverName: string;
  serverDescription?: string;
  publicIp?: string;
  platformType?: Code;
  serverImageProductCode?: string;
  serverInstanceStatus?: Code;
  serverInstanceStatusName?: string;
  createDate?: string;
  zoneCode?: string;
  cpuCount?: number;
  memorySize?: number;
};
type Nic = { instanceNo?: string; ip?: string; isDefault?: boolean; deviceName?: string; secondaryIpList?: string[] };
type DbServer = {
  serverName: string;
  role?: Code;
  status?: string;
  privateDomain?: string;
  privateIp?: string;
  zoneCode?: string;
  createDate?: string;
};

const ymd = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");

/**
 * 이미지 코드에서 OS 버전 짐작.
 * 예) ...UBNTU.SVR2204.B050 → 22.04, ...ROCKY.0810... → 8.10
 *     ...UBNTU.SVR22.G003 → 22, ...ROCKY.09.G003 → 9 (주 버전만 있는 코드)
 */
export function osVersionFromImage(code?: string): string {
  if (!code) return "";
  // 점으로 나눈 조각에서 OS 이름 조각(UBNTU, ROCKY 등) 바로 다음 조각이 버전이다.
  // (앞쪽 "VSVR", "LNX64" 같은 조각은 버전이 아니므로 보지 않는다)
  const segs = code.toUpperCase().split(".");
  const i = segs.findIndex((s) => /^(UBNTU|UBUNTU|ROCKY|CNTOS|CENTOS|RHEL|RL|ORCL|DEBIAN|WND|WIN)$/.test(s));
  if (i < 0 || i + 1 >= segs.length) return "";
  const digits = segs[i + 1].replace(/\D/g, "");
  if (!digits) return "";
  const ubuntu = /UBNTU|UBUNTU/.test(segs[i]);
  if (digits.length === 4) {
    // Ubuntu는 연.월 표기(22.04)라 0을 유지하고, 나머지(Rocky 8.10 등)는 앞의 0을 뗀다
    const minor = ubuntu ? digits.slice(2) : String(Number(digits.slice(2)));
    return `${Number(digits.slice(0, 2))}.${minor}`;
  }
  if (digits.length <= 2) return String(Number(digits)); // 주 버전만 있는 코드 (예: SVR22, 09)
  return "";
}

/** 서버(일반 VM·쿠버네티스 워커 노드 포함) + 기본 네트워크 인터페이스의 사설 IP */
async function servers(c: NcloudConfig): Promise<CloudAsset[]> {
  const [list, nics] = await Promise.all([
    listAll<Server>(c, "/vserver/v2", "getServerInstanceList", "serverInstanceList"),
    listAll<Nic>(c, "/vserver/v2", "getNetworkInterfaceList", "networkInterfaceList"),
  ]);
  const ipOf = new Map<string, string[]>();
  for (const n of nics) {
    if (!n.instanceNo || !n.ip) continue;
    const arr = ipOf.get(n.instanceNo) ?? [];
    // 기본 인터페이스(eth0)를 앞에
    if (n.isDefault || n.deviceName === "eth0") arr.unshift(n.ip);
    else arr.push(n.ip);
    ipOf.set(n.instanceNo, arr);
  }
  return list.map((s) => {
    const ips = ipOf.get(s.serverInstanceNo) ?? [];
    return {
      kind: "server",
      id: s.serverInstanceNo,
      name: s.serverName,
      privateIp: ips[0] ?? "",
      extraIps: ips.slice(1),
      publicIp: s.publicIp ?? "",
      os: s.platformType?.codeName ?? "",
      osVersion: osVersionFromImage(s.serverImageProductCode),
      image: s.serverImageProductCode ?? "",
      status: s.serverInstanceStatusName ?? s.serverInstanceStatus?.codeName ?? "",
      createDate: ymd(s.createDate),
      zone: s.zoneCode ?? "",
      description: s.serverDescription ?? "",
    } satisfies CloudAsset;
  });
}

async function mysql(c: NcloudConfig): Promise<CloudAsset[]> {
  type Inst = {
    cloudMysqlServiceName: string;
    engineVersion?: string;
    createDate?: string;
    cloudMysqlServerInstanceList?: (DbServer & {
      cloudMysqlServerName: string;
      cloudMysqlServerRole?: Code;
      cloudMysqlServerInstanceStatusName?: string;
    })[];
  };
  // 목록 API는 요약만 준다(도메인·버전·생성일 없음) → 인스턴스마다 상세 조회
  const summary = await listAll<Inst & { cloudMysqlInstanceNo: string }>(
    c, "/vmysql/v2", "getCloudMysqlInstanceList", "cloudMysqlInstanceList", {}, 0,
  );
  const list: Inst[] = [];
  for (const s of summary) {
    const d = await getList<Inst>(c, "/vmysql/v2", "getCloudMysqlInstanceDetail", "cloudMysqlInstanceList", {
      cloudMysqlInstanceNo: String(s.cloudMysqlInstanceNo),
    });
    list.push(d[0] ?? s);
  }
  return list.flatMap((i) =>
    (i.cloudMysqlServerInstanceList ?? []).map((s) => ({
      kind: "mysql" as const,
      id: `${i.cloudMysqlServiceName}/${s.cloudMysqlServerName}`,
      name: s.cloudMysqlServerName,
      service: i.cloudMysqlServiceName,
      role: s.cloudMysqlServerRole?.codeName ?? s.cloudMysqlServerRole?.code ?? "",
      privateIp: s.privateIp ?? "",
      extraIps: [],
      publicIp: "",
      domain: s.privateDomain ?? "",
      os: "MYSQL",
      osVersion: i.engineVersion?.replace(/^MYSQL/i, "").trim() ?? "",
      image: "",
      status: s.cloudMysqlServerInstanceStatusName ?? "",
      // 도입일과 맞추려고 DB 서비스(인스턴스) 생성일을 쓴다. 서버는 장애 조치·재생성으로 날짜가 바뀔 수 있다
      createDate: ymd(i.createDate ?? s.createDate),
      zone: s.zoneCode ?? "",
      description: "",
    })),
  );
}

async function redis(c: NcloudConfig): Promise<CloudAsset[]> {
  type Inst = {
    cloudRedisServiceName: string;
    engineVersion?: string;
    createDate?: string;
    cloudRedisServerInstanceList?: {
      cloudRedisServerName: string;
      cloudRedisServerRole?: Code;
      cloudRedisServerInstanceStatusName?: string;
      privateDomain?: string;
      zoneCode?: string;
      createDate?: string;
    }[];
  };
  const summary = await listAll<Inst & { cloudRedisInstanceNo: string }>(
    c, "/vredis/v2", "getCloudRedisInstanceList", "cloudRedisInstanceList", {}, 0,
  );
  const list: Inst[] = [];
  for (const s of summary) {
    const d = await getList<Inst>(c, "/vredis/v2", "getCloudRedisInstanceDetail", "cloudRedisInstanceList", {
      cloudRedisInstanceNo: String(s.cloudRedisInstanceNo),
    });
    list.push(d[0] ?? s);
  }
  return list.flatMap((i) =>
    (i.cloudRedisServerInstanceList ?? []).map((s) => ({
      kind: "redis" as const,
      id: `${i.cloudRedisServiceName}/${s.cloudRedisServerName}`,
      name: s.cloudRedisServerName,
      service: i.cloudRedisServiceName,
      role: s.cloudRedisServerRole?.codeName ?? s.cloudRedisServerRole?.code ?? "",
      privateIp: "",
      extraIps: [],
      publicIp: "",
      domain: s.privateDomain ?? "",
      os: "REDIS",
      osVersion: i.engineVersion?.replace(/^REDIS/i, "").trim() ?? "",
      image: "",
      status: s.cloudRedisServerInstanceStatusName ?? "",
      // 도입일과 맞추려고 DB 서비스(인스턴스) 생성일을 쓴다. 서버는 장애 조치·재생성으로 날짜가 바뀔 수 있다
      createDate: ymd(i.createDate ?? s.createDate),
      zone: s.zoneCode ?? "",
      description: "",
    })),
  );
}

export type FetchResult = { assets: CloudAsset[]; errors: string[]; fetchedAt: string };

/** 서비스별로 따로 가져온다. 한 서비스가 실패해도(권한 없음 등) 나머지 결과는 쓴다. */
export async function fetchInventory(c = ncloudConfig()): Promise<FetchResult> {
  const parts: [string, (c: NcloudConfig) => Promise<CloudAsset[]>][] = [
    ["서버", servers],
    ["Cloud DB for MySQL", mysql],
    ["Cloud DB for Redis", redis],
  ];
  const assets: CloudAsset[] = [];
  const errors: string[] = [];
  for (const [label, fn] of parts) {
    try {
      assets.push(...(await fn(c)));
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { assets, errors, fetchedAt: new Date().toISOString() };
}
