import { abnormalPathTemplate } from "./abnormal-path";
import { accessReviewTemplate } from "./access-review";
import { backupTemplate } from "./backup";
import type { TemplateSchema } from "./types";

/** 기본 제공 템플릿. 시드 시 DB에 등록된다. */
export const BUILTIN_TEMPLATES: TemplateSchema[] = [
  abnormalPathTemplate,
  backupTemplate,
  accessReviewTemplate,
];

/** 접근권한 점검 대상 (STEG_CSAP_085 기준) */
export const BUILTIN_ASSETS: { name: string; kind: string; tags: string }[] = [
  { name: "SSL VPN", kind: "VPN", tags: "access-review" },
  { name: "steg-k8s-node-w-8c61", kind: "SERVER", tags: "access-review" },
  { name: "steg-k8s-node-w-90b8", kind: "SERVER", tags: "access-review" },
  { name: "new-steg-web01", kind: "SERVER", tags: "access-review" },
  { name: "new-steg-web02", kind: "SERVER", tags: "access-review" },
  { name: "new-steg-web03", kind: "SERVER", tags: "access-review" },
  { name: "new-steg-web04", kind: "SERVER", tags: "access-review" },
  { name: "new-steg-web05", kind: "SERVER", tags: "access-review" },
  { name: "priv-steg-web05", kind: "SERVER", tags: "access-review" },
  { name: "new-steg-bastion", kind: "SERVER", tags: "access-review" },
  { name: "new-steg-ngs01", kind: "SERVER", tags: "access-review" },
  { name: "monitor-steg01", kind: "SERVER", tags: "access-review" },
  { name: "steg-prod-mysql-svc", kind: "DB", tags: "access-review" },
  { name: "steg-redis-svc2-001-42n0", kind: "CACHE", tags: "access-review" },
];

export type { TemplateSchema };
