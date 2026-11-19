import { ActionForm } from "@/components/ActionForm";
import { UserRowActions } from "@/components/admin/UserRowActions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/status";
import { createUser } from "../actions";

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-xl font-semibold">사용자</h1>

      <section className="card px-5 py-4">
        <h2 className="mb-3 font-semibold">사용자 추가</h2>
        <ActionForm action={createUser} submitLabel="추가" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <label className="label" htmlFor="f-loginId">아이디</label>
              <input id="f-loginId" name="loginId" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="f-name">이름</label>
              <input id="f-name" name="name" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="f-email">이메일</label>
              <input id="f-email" name="email" type="email" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="f-role">권한</label>
              <select id="f-role" name="role" className="input" defaultValue="USER">
                <option value="USER">사용자</option>
                <option value="ADMIN">관리자</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-password">초기 비밀번호</label>
              <input id="f-password" name="password" type="password" className="input" autoComplete="new-password" required />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            비밀번호는 9자 이상, 영문·숫자·특수문자를 포함해야 합니다. 초기 비밀번호는 본인에게 따로 전달하고, 첫 로그인 후
            내 계정에서 바꾸도록 안내하세요.
          </p>
        </ActionForm>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr>
              <th className="th">아이디</th>
              <th className="th">이름</th>
              <th className="th">이메일</th>
              <th className="th">권한</th>
              <th className="th">2단계 인증</th>
              <th className="th">상태</th>
              <th className="th">최근 로그인</th>
              <th className="th">관리</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td className="td font-mono text-xs">{u.loginId}</td>
                <td className="td">{u.name}</td>
                <td className="td text-slate-600">{u.email ?? "-"}</td>
                <td className="td">{u.role === "ADMIN" ? "관리자" : "사용자"}</td>
                <td className="td">
                  {u.totpEnabled ? (
                    <span className="badge bg-emerald-50 text-emerald-700">등록됨</span>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-600">미등록</span>
                  )}
                </td>
                <td className="td">
                  {!u.active ? (
                    <span className="badge bg-slate-100 text-slate-600">사용 중지</span>
                  ) : u.lockedAt ? (
                    <span className="badge bg-red-50 text-red-700">잠김</span>
                  ) : (
                    <span className="badge bg-emerald-50 text-emerald-700">정상</span>
                  )}
                </td>
                <td className="td whitespace-nowrap">{formatDate(u.lastLoginAt, true)}</td>
                <td className="td">
                  <UserRowActions
                    userId={u.id}
                    isSelf={u.id === me.id}
                    role={u.role}
                    active={u.active}
                    locked={!!u.lockedAt}
                    totpEnabled={u.totpEnabled}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
