import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { login } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ locked?: string }> }) {
  if ((await db.user.count()) === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const { locked } = await searchParams;
  return (
    <>
      <h2 className="mb-4 font-semibold">로그인</h2>
      {locked && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          인증 코드를 5회 틀려 계정이 잠겼습니다. 관리자에게 잠금 해제를 요청하세요.
        </p>
      )}
      <AuthForm
        action={login}
        submitLabel="다음"
        fields={[
          { name: "loginId", label: "아이디", autoComplete: "username" },
          { name: "password", label: "비밀번호", type: "password", autoComplete: "current-password" },
        ]}
      />
      <p className="mt-4 text-xs text-slate-500">
        비밀번호 또는 인증 코드를 5회 틀리면 계정이 잠깁니다.
      </p>
    </>
  );
}
