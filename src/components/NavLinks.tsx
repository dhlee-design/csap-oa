"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/", label: "대시보드" },
  { href: "/runs", label: "점검 일정" },
  { href: "/approvals", label: "승인함" },
];

const ADMIN = [
  { href: "/admin/templates", label: "점검 템플릿·담당자" },
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/asset-register", label: "자산관리대장" },
  { href: "/admin/assets", label: "대상 자산" },
  { href: "/admin/audit", label: "감사 로그" },
];

export function NavLinks({ isAdmin, pendingApprovals }: { isAdmin: boolean; pendingApprovals: number }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const cls = (href: string) =>
    `flex items-center justify-between rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
      active(href) ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:block md:space-y-0.5 md:overflow-visible">
      {MAIN.map((l) => (
        <Link key={l.href} href={l.href} className={cls(l.href)}>
          {l.label}
          {l.href === "/approvals" && pendingApprovals > 0 && (
            <span className="ml-2 rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">
              {pendingApprovals}
            </span>
          )}
        </Link>
      ))}
      {isAdmin && (
        <>
          <div className="hidden px-3 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 md:block">
            관리
          </div>
          {ADMIN.map((l) => (
            <Link key={l.href} href={l.href} className={cls(l.href)}>
              {l.label}
            </Link>
          ))}
        </>
      )}
      <Link href="/account" className={`${cls("/account")} md:mt-4`}>
        내 계정
      </Link>
    </nav>
  );
}
