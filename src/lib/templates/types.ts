// 점검 템플릿 스키마.
// 새 점검은 이 형식의 JSON만 추가하면 되며, 화면·검증·저장 로직은 공통이다.

export type Frequency = "MONTHLY" | "QUARTERLY" | "HALF" | "YEARLY";

export type ChecklistSection = {
  type: "checklist";
  key: string;
  title: string;
  /** 결과 선택지. 첫 번째가 "정상" 값 */
  resultOptions: string[];
  /** 이상으로 간주하는 결과 값 */
  abnormalValues: string[];
  groups: {
    title: string;
    /** 이 그룹에 연결된 증적 슬롯 키 */
    evidenceSlots?: string[];
    items: { key: string; label: string }[];
  }[];
};

export type MatrixSection = {
  type: "matrix";
  key: string;
  title: string;
  description?: string;
  /** 회차 생성 시 이 태그가 붙은 자산을 대상으로 스냅샷 */
  targetTag: string;
  /** 회차 생성 시 채워지는 대상 목록 (템플릿 원본에서는 비어 있음) */
  targets?: string[];
  criteria: { key: string; label: string }[];
  resultOptions: string[];
  detailOptions: string[];
  abnormalDetails: string[];
};

export type ColumnKind =
  | "text"
  | "textarea"
  | "select"
  | "date"
  | "datetime"
  | "number"
  | "fixed" // 템플릿에 고정된 값 (편집 불가)
  | "computed";

export type Column = {
  key: string;
  label: string;
  kind: ColumnKind;
  options?: string[];
  /** computed 열 계산 함수 이름 (lib/templates/compute.ts) */
  compute?: string;
  required?: boolean;
  width?: string;
  /** 이 값이면 이상으로 간주 */
  abnormalValues?: string[];
};

export type TableSection = {
  type: "table";
  key: string;
  title: string;
  description?: string;
  columns: Column[];
  /** 고정 행 (행 키 + fixed 열 값). 없으면 사용자가 행을 추가 */
  rows?: { key: string; values: Record<string, string> }[];
  /** 고정 행이 기간에 따라 만들어지는 경우 (예: 이번 달 일수) */
  rowFactory?: string;
  minRows?: number;
  /** 행 추가형 섹션이 이번 회차에 필수인지 */
  optional?: boolean;
};

export type SummarySection = {
  type: "summary";
  key: string;
  title: string;
  /** 종합 의견 칸 표시 여부 */
  withOpinion?: boolean;
};

export type Section = ChecklistSection | MatrixSection | TableSection | SummarySection;

export type EvidenceSlot = {
  key: string;
  title: string;
  /** 무엇을 캡처해야 하는지 */
  guide: string;
  required: boolean;
};

export type TemplateSchema = {
  code: string;
  name: string;
  basis: string;
  description: string;
  frequency: Frequency;
  roles: { inspector: string; approver: string };
  /** 이상 발견 시 안내 문구 */
  escalation?: string;
  /** 기준값 (예: 보관 일수) */
  params?: Record<string, number | string>;
  sections: Section[];
  evidenceSlots: EvidenceSlot[];
};

// ── 회차 입력 데이터 ──────────────────────────────

export type ChecklistData = Record<string, { result?: string; note?: string }>;
export type MatrixData = Record<string, Record<string, { result?: string; detail?: string }>>;
export type TableRow = { key: string; values: Record<string, string> };
export type TableData = { rows: TableRow[] };
export type SummaryData = {
  overall?: "이상 없음" | "이상 발견";
  issue?: string;
  action?: string;
  actionStatus?: "완료" | "진행 중";
  opinion?: string;
};

export type RunData = Record<string, ChecklistData | MatrixData | TableData | SummaryData>;
