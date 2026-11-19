import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getPendingSession } from "@/lib/auth";
import { logout, verifyOtp } from "../../actions";

export default async function OtpPage() {
  const s = await getPendingSession();
  if (!s) redirect("/login");
  if (s.totpPassed) redirect("/");
  if (!s.user.totpEnabled) redirect("/login/totp-setup");
  return (
    <>
      <h2 className="mb-1 font-semibold">2단계 인증</h2>
      <p className="mb-4 text-sm text-slate-500">
        {s.user.name}님, 인증 앱에 표시된 6자리 코드를 입력하세요.
      </p>
      <AuthForm
        action={verifyOtp}
        submitLabel="로그인"
        fields={[
          { name: "code", label: "인증 코드", inputMode: "numeric", autoComplete: "one-time-code", placeholder: "000000" },
        ]}
      />
      <form action={logout} className="mt-3 text-center">
        <button className="text-xs text-slate-500 underline">다른 계정으로 로그인</button>
      </form>
    </>
  );
}
