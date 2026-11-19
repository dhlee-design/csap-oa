import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readEvidence } from "@/lib/evidence";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("로그인이 필요합니다.", { status: 401 });
  const { id } = await ctx.params;
  const ev = await db.evidence.findUnique({ where: { id } });
  if (!ev) return new Response("Not found", { status: 404 });

  const buf = await readEvidence(ev.storagePath);
  const download = new URL(req.url).searchParams.has("download");
  if (download) {
    await audit({ id: user.id, name: user.name }, "evidence.downloaded", { type: "evidence", id: ev.id });
  }
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": ev.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(ev.storedName)}`,
      "X-Content-SHA256": ev.sha256,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
