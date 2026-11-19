export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            C
          </div>
          <h1 className="text-lg font-semibold">CSAP 정기점검</h1>
          <p className="text-sm text-slate-500">점검 수행·증적 관리 시스템</p>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
