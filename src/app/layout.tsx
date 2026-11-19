import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CSAP 정기점검",
  description: "CSAP 정기점검 수행·증적 관리 시스템",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
