import { exportFileName, exportRegister, templateMeta } from "@/lib/asset-register";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";

// 현재 자산 데이터를 올린 양식 파일과 같은 형식의 xlsx로 내려준다
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("로그인이 필요합니다.", { status: 401 });
  if (user.role !== "ADMIN") return new Response("관리자만 내려받을 수 있습니다.", { status: 403 });
  const meta = await templateMeta();
  if (!meta) return new Response("양식 파일이 없습니다. 자산관리대장 화면에서 먼저 올리세요.", { status: 404 });

  const buf = await exportRegister();
  const name = exportFileName(meta);
  await audit({ id: user.id, name: user.name }, "asset_register.exported", undefined, { name });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
