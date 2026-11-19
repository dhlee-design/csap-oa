import { NavLinks } from "@/components/NavLinks";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logout } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pendingApprovals = await db.inspectionRun.count({
    where: { status: "SUBMITTED", ...(user.role === "ADMIN" ? {} : { approverId: user.id }) },
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            C
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">CSAP 정기점검</div>
            <div className="text-[11px] text-slate-500">E-GENE ITSM</div>
          </div>
        </div>
        <NavLinks isAdmin={user.role === "ADMIN"} pendingApprovals={pendingApprovals} />
        <div className="hidden border-t border-slate-100 px-4 py-3 text-xs md:absolute md:bottom-0 md:block md:w-full">
          <div className="font-medium text-slate-700">{user.name}</div>
          <div className="mb-2 text-slate-500">
            {user.loginId} · {user.role === "ADMIN" ? "관리자" : "사용자"}
          </div>
          <form action={logout}>
            <button className="text-slate-500 underline hover:text-slate-700">로그아웃</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
