import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthForm } from "@/components/AuthForm";
import { db } from "@/lib/db";
import { setupAdmin } from "../actions";

export default async function SetupPage() {
  await connection(); // 요청마다 사용자 수를 확인해야 하므로 정적 렌더링하지 않는다
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <>
      <h2 className="mb-1 font-semibold">최초 관리자 등록</h2>
      <p className="mb-4 text-sm text-slate-500">
        처음 실행했습니다. 시스템 관리자 계정을 만드세요. 다른 사용자는 로그인한 뒤 관리 화면에서 추가합니다.
      </p>
      <AuthForm
        action={setupAdmin}
        submitLabel="관리자 만들기"
        fields={[
          { name: "loginId", label: "아이디", autoComplete: "username", hint: "영문·숫자 3~30자" },
          { name: "name", label: "이름" },
          { name: "email", label: "이메일", type: "email", required: false, hint: "알림 수신용 (선택)" },
          {
            name: "password",
            label: "비밀번호",
            type: "password",
            autoComplete: "new-password",
            hint: "9자 이상, 영문·숫자·특수문자 포함",
          },
          { name: "confirm", label: "비밀번호 확인", type: "password", autoComplete: "new-password" },
        ]}
      />
    </>
  );
}
