import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { authorizeShare, getShareRow, originIsSame, SHARE_ID_PATTERN } from "@/lib/share-store";
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
  if (!row) {
    if (!await getShareRow(id)) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    return Response.json({ error: "分享管理凭证无效。" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (row.status !== "uploading" && row.status !== "ready" && row.status !== "deleting") {
    return Response.json({ error: "分享页已失效。" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const db = getDb();
    await db.update(sharedArchives).set({ status: "deleting" }).where(and(
      eq(sharedArchives.id, id),
      eq(sharedArchives.tokenHash, row.tokenHash),
      inArray(sharedArchives.status, ["uploading", "ready", "deleting"]),
    ));
    const [deletingRow] = await db.select({ status: sharedArchives.status }).from(sharedArchives).where(and(
      eq(sharedArchives.id, id), eq(sharedArchives.tokenHash, row.tokenHash),
    )).limit(1);
    if (deletingRow?.status !== "deleting") {
      return Response.json({ error: "分享页状态已变化，请刷新后重试。" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const assets = await db.select().from(sharedAssets).where(eq(sharedAssets.shareId, id));
    if (assets.length && !env.BUCKET) throw new Error("Birthday archive media bucket is unavailable");
    if (env.BUCKET) await Promise.all(assets.map(asset => env.BUCKET!.delete(`shares/${id}/${asset.giftId}/${asset.kind}`)));
    await db.delete(sharedAssets).where(eq(sharedAssets.shareId, id));
    await db.delete(sharedArchives).where(and(
      eq(sharedArchives.id, id), eq(sharedArchives.tokenHash, row.tokenHash), eq(sharedArchives.status, "deleting"),
    ));
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to remove birthday archive share", error);
    return Response.json({ error: "页面已暂停访问，但内容未能彻底删除，请稍后重试。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
