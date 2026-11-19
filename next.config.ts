import type { NextConfig } from "next";

// 사내 점검 시스템은 모든 화면이 로그인 사용자 기준의 실시간 데이터라서
// Cache Components(정적 셸 사전 렌더링)를 쓰지 않는다.
const nextConfig: NextConfig = {
  cacheComponents: false,
  partialPrefetching: false,
  serverExternalPackages: ["@prisma/client", ".prisma/client", "exceljs"],
  experimental: {
    serverActions: {
      // 증적 캡처 업로드 (최대 20MB)
      bodySizeLimit: "20mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
