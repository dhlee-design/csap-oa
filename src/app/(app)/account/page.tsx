import { ActionForm } from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { changeMyPassword } from "../admin/actions";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">내 계정</h1>
      <section className="card px-5 py-4 text-sm">
        <dl className="grid grid-cols-[100px_1fr] gap-y-1.5">
          <dt className="text-slate-500">아이디</dt>
          <dd>{user.loginId}</dd>
          <dt className="text-slate-500">이름</dt>
          <dd>{user.name}</dd>
          <dt className="text-slate-500">이메일</dt>
          <dd>{user.email ?? "-"}</dd>
          <dt className="text-slate-500">권한</dt>
          <dd>{user.role === "ADMIN" ? "관리자" : "사용자"}</dd>
          <dt className="text-slate-500">2단계 인증</dt>
          <dd>{user.totpEnabled ? "등록됨" : "미등록"}</dd>
        </dl>
      </section>
      <section className="card px-5 py-4">
        <h2 className="mb-3 font-semibold">비밀번호 변경</h2>
        <ActionForm action={changeMyPassword} submitLabel="변경" className="space-y-3">
          <div>
            <label className="label" htmlFor="f-current">현재 비밀번호</label>
            <input id="f-current" name="current" type="password" className="input" autoComplete="current-password" required />
          </div>
          <div>
            <label className="label" htmlFor="f-next">새 비밀번호</label>
            <input id="f-next" name="next" type="password" className="input" autoComplete="new-password" required />
            <p className="mt-1 text-xs text-slate-500">9자 이상, 영문·숫자·특수문자 포함</p>
          </div>
          <div>
            <label className="label" htmlFor="f-confirm">새 비밀번호 확인</label>
            <input id="f-confirm" name="confirm" type="password" className="input" autoComplete="new-password" required />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
