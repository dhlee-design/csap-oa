import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { AuthForm } from "@/components/AuthForm";
import { getPendingSession, newTotpSecret, totpUri } from "@/lib/auth";
import { db } from "@/lib/db";
import { enableTotp, logout } from "../../actions";

export default async function TotpSetupPage() {
  const s = await getPendingSession();
  if (!s) redirect("/login");
  if (s.user.totpEnabled) redirect(s.totpPassed ? "/" : "/login/otp");

  let secret = s.user.totpSecret;
  if (!secret) {
    secret = newTotpSecret();
    await db.user.update({ where: { id: s.user.id }, data: { totpSecret: secret } });
  }
  const qr = await QRCode.toDataURL(totpUri(s.user.loginId, secret), { margin: 1, width: 180 });

  return (
    <>
      <h2 className="mb-1 font-semibold">2단계 인증 등록</h2>
      <p className="mb-4 text-sm text-slate-500">
        Google Authenticator, Microsoft Authenticator 같은 인증 앱으로 아래 QR 코드를 스캔한 뒤, 앱에
        표시된 6자리 코드를 입력하세요.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="2단계 인증 QR 코드" className="mx-auto mb-3 h-44 w-44" />
      <p className="mb-4 text-center text-xs text-slate-500">
        직접 입력용 키
        <br />
        <code className="font-mono text-[11px] break-all text-slate-700 select-all">{secret}</code>
      </p>
      <AuthForm
        action={enableTotp}
        submitLabel="등록하고 로그인"
        fields={[
          { name: "code", label: "인증 코드", inputMode: "numeric", autoComplete: "one-time-code", placeholder: "000000" },
        ]}
      />
      <form action={logout} className="mt-3 text-center">
        <button className="text-xs text-slate-500 underline">취소하고 로그아웃</button>
      </form>
    </>
  );
}
