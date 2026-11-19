import type { TemplateSchema } from "./types";

// 출처: STEG_CSAP_085_접근권한 점검대장, 접근통제관리지침 제10조 ② 및 별지 서식
export const accessReviewTemplate: TemplateSchema = {
  code: "ACC-REVIEW",
  name: "접근권한 점검",
  basis: "접근통제관리지침 제10조 ② (별지 서식 「접근권한 점검대장」, STEG_CSAP_085)",
  description:
    "대상 시스템별 사용자 접근권한의 적합성을 점검하고 정보보호책임자에게 보고한다.",
  frequency: "MONTHLY",
  roles: { inspector: "서버보안관리자", approver: "정보보호책임자" },
  sections: [
    {
      type: "matrix",
      key: "matrix",
      title: "시스템별 접근권한 점검",
      description:
        "대조 자료: 081 정보시스템 계정 및 권한 관리대장, 083 서버관리자 계정 관리대장, 084 특수권한 관리자 계정 관리대장",
      targetTag: "access-review",
      criteria: [
        { key: "c1", label: "공식적인 절차에 따른 접근권한 부여 여부" },
        { key: "c2", label: "접근권한 분류체계의 업무목적(직무) 및 보안규정 부합 여부" },
        { key: "c3", label: "접근권한 부여 승인자에 대한 적절성" },
        { key: "c4", label: "직무변경 시 기존 권한 회수 후 신규업무에 적합한 권한부여 여부" },
        { key: "c5", label: "업무 목적 이외의 과도한 접근권한 부여 여부" },
        { key: "c6", label: "사용하지 않은 유휴계정 존재 여부" },
        { key: "c7", label: "특권자 계정 사용의 적절성 여부" },
      ],
      resultOptions: ["점검완료", "미점검"],
      detailOptions: ["이상 없음", "대상 없음", "정식절차대로 처리", "조치 필요"],
      abnormalDetails: ["조치 필요"],
    },
    { type: "summary", key: "summary", title: "점검 결과 종합" },
  ],
  evidenceSlots: [
    {
      key: "A-01",
      title: "계정·권한 관리대장 대조 자료",
      guide: "점검 시점의 081/083/084 관리대장 또는 시스템 계정 목록 화면",
      required: false,
    },
    {
      key: "A-02",
      title: "조치 증적",
      guide: "권한 회수·유휴계정 삭제 등 조치를 한 경우 그 화면",
      required: false,
    },
  ],
};
