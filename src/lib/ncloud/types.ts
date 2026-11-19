// 네이버클라우드에서 가져온 자산 (서비스 종류와 상관없이 같은 모양으로 맞춘다)
export type CloudAsset = {
  kind: "server" | "mysql" | "redis";
  id: string;
  name: string; // 서버 이름 (= 대장의 호스트명)
  service?: string; // DB 서비스 이름
  role?: string; // DB 역할 (Master / Standby Master / Slave 등)
  privateIp: string;
  extraIps: string[];
  publicIp: string;
  domain?: string; // DB 접속 도메인
  os: string;
  osVersion: string;
  image: string;
  status: string;
  createDate: string; // yyyy-mm-dd
  zone: string;
  description: string;
};

export const KIND_LABEL: Record<CloudAsset["kind"], string> = {
  server: "서버",
  mysql: "Cloud DB for MySQL",
  redis: "Cloud DB for Redis",
};
