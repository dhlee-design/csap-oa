import "server-only";
import { listAll, ncloudConfig, type NcloudConfig } from "./client";
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

/** 이미지 코드에서 OS 버전 짐작. 예) SW.VSVR.OS.LNX64.UBNTU.SVR2204.B050 → 22.04, ...ROCKY.0810... → 8.10 */
export function osVersionFromImage(code?: string): string {
  if (!code) return "";
  const m = /(?:SVR|ROCKY|RL|CNTOS|RHEL)\D*?(\d{2})(\d{2})\b/i.exec(code) ?? /\.(\d{1,2})(\d{2})\./.exec(code);
  if (!m) return "";
  const major = String(Number(m[1]));
  // Ubuntu는 연.월 표기(22.04)라 0을 유지하고, 나머지(Rocky 9.6 등)는 앞의 0을 뗀다
  const minor = /UBNTU|UBUNTU/i.test(code) ? m[2] : String(Number(m[2]));
  return `${major}.${minor}`;
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
  const list = await listAll<Inst>(c, "/vmysql/v2", "getCloudMysqlInstanceList", "cloudMysqlInstanceList");
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
      createDate: ymd(s.createDate ?? i.createDate),
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
  const list = await listAll<Inst>(c, "/vredis/v2", "getCloudRedisInstanceList", "cloudRedisInstanceList");
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
      createDate: ymd(s.createDate ?? i.createDate),
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
