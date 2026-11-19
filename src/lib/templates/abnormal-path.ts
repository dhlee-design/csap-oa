import type { TemplateSchema } from "./types";

// 출처: 261012_비정상통신경로_점검체크리스트.docx
export const abnormalPathTemplate: TemplateSchema = {
  code: "NET-ABNORMAL-PATH",
  name: "비정상 통신경로 정기 점검",
  basis: "CSAP 보안인증기준(시스템 격리)",
  description:
    "보안관제가 적용되는 서비스 네트워크 이외의 비정상 통신경로 발생 여부를 정기적으로 점검한다.",
  frequency: "MONTHLY",
  roles: { inspector: "점검자", approver: "승인자" },
  escalation: "비정상 통신경로가 확인되면 정보시스템관리자에게 즉시 보고한 뒤 조치한다.",
  params: { target: "서비스 VPC" },
  sections: [
    {
      type: "checklist",
      key: "items",
      title: "점검 항목",
      resultOptions: ["Y", "N"],
      abnormalValues: ["N"],
      groups: [
        {
          title: "서비스 네트워크 외 통신 경로",
          evidenceSlots: ["N-01"],
          items: [
            { key: "svc-1", label: "서비스 서버가 보안관제 적용 네트워크만 통해 외부 통신하는가" },
            { key: "svc-2", label: "서비스 네트워크 외 별도 인터넷 직결(우회) 경로가 존재하지 않는가" },
            { key: "svc-3", label: "관리 네트워크를 통한 외부 통신 경로(우회)가 존재하지 않는가" },
          ],
        },
        {
          title: "정책 점검(방화벽/접근제어)",
          evidenceSlots: ["N-02"],
          items: [
            { key: "pol-1", label: "승인되지 않은 외부 IP 허용 정책이 없는가" },
            { key: "pol-2", label: "승인되지 않은 외부 포트/프로토콜 허용 정책이 없는가" },
            { key: "pol-3", label: "임시/예외 허용 정책이 잔존하지 않는가(만료·복구 포함)" },
          ],
        },
        {
          title: "보안관제 로그 점검",
          evidenceSlots: ["N-03"],
          items: [
            { key: "log-1", label: "비인가 외부 통신 탐지/차단 이력(방화벽/IPS)이 없는가" },
            { key: "log-2", label: "우회 통신 시도/반복 탐지 등 이상 징후가 없는가" },
          ],
        },
        {
          title: "관리 네트워크 점검",
          evidenceSlots: ["N-04"],
          items: [
            { key: "mgmt-1", label: "관리망 외부 통신이 발생하지 않는가(정책 및 로그 기준)" },
            { key: "mgmt-2", label: "관리 접근 경로가 서비스망을 우회하지 않는가(경로/정책 기준)" },
          ],
        },
      ],
    },
    { type: "summary", key: "summary", title: "점검 결과 종합" },
  ],
  evidenceSlots: [
    {
      key: "N-01",
      title: "서비스 네트워크 외 통신 경로 점검",
      guide: "VPC 라우팅 테이블·인터넷 게이트웨이·NAT 구성 화면 (서비스망 외 경로가 없음이 보이게)",
      required: true,
    },
    {
      key: "N-02",
      title: "접근제어 정책 점검",
      guide: "ACG/방화벽 인바운드·아웃바운드 정책 목록 (허용 IP·포트가 보이게, 여러 장 가능)",
      required: true,
    },
    {
      key: "N-03",
      title: "보안관제 로그 점검",
      guide: "점검 기간의 방화벽/IPS 탐지·차단 로그 조회 화면",
      required: true,
    },
    {
      key: "N-04",
      title: "관리 네트워크 점검",
      guide: "관리망(bastion·SSL VPN) 접근 경로와 정책 화면",
      required: true,
    },
  ],
};
