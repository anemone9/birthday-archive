import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authorizeShare, originIsSame, SHARE_ID_PATTERN } from "@/lib/share-store";
import { sharedArchives, sharedAssets } from "@/db/schema";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const row = await authorizeShare(request, id);
  if (!row) return Response.json({ error: "分享记录不存在。" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({ ready: row.status === "ready", path: row.status === "ready" ? `/p/${id}` : null }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  if (!originIsSame(request) || !SHARE_ID_PATTERN.test(id)) return Response.json({ error: "无法清理这份未完成的分享。" }, { status: 403 });
  const row = await authorizeShare(request, id);
  if (!row || row.status !== "uploading") return Response.json({ error: "分享已完成或已失效。" }, { status: 404 });
  try {
    const db = getDb();
    const assets = await db.select().from(sharedAssets).where(eq(sharedAssets.shareId, id));
    if (env.BUCKET) await Promise.all(assets.map(asset => env.BUCKET!.delete(`shares/${id}/${asset.giftId}/${asset.kind}`)));
    await db.delete(sharedAssets).where(eq(sharedAssets.shareId, id));
    await db.delete(sharedArchives).where(and(eq(sharedArchives.id, id), eq(sharedArchives.status, "uploading")));
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to remove incomplete birthday archive share", error);
    return Response.json({ error: "未完成的分享未能清理，请稍后重试。" }, { status: 503 });
  }
}
