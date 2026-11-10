import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authorizeShare, originIsSame, validateExpectedAssets, type ExpectedAsset } from "@/lib/share-store";
import { validateArchive } from "@/lib/archive";
import { sharedArchives, sharedAssets } from "@/db/schema";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!originIsSame(request)) return Response.json({ error: "请从生日档案页面完成生成。" }, { status: 403 });
  const row = await authorizeShare(request, id);
  if (!row || row.status !== "uploading") return Response.json({ error: "这份分享已完成或已失效。" }, { status: 404 });

  try {
    const archive = validateArchive(JSON.parse(row.archiveJson));
    const expected = validateExpectedAssets(JSON.parse(row.expectedAssetsJson), archive);
    const actualRows = await getDb().select().from(sharedAssets).where(eq(sharedAssets.shareId, id));
    const actual: ExpectedAsset[] = actualRows.map(item => ({
      giftId: item.giftId,
      kind: item.kind as ExpectedAsset["kind"],
      byteLength: item.byteLength,
    }));
    const expectedKey = expected.map(item => `${item.giftId}:${item.kind}:${item.byteLength}`).sort().join("|");
    const actualKey = actual.map(item => `${item.giftId}:${item.kind}:${item.byteLength}`).sort().join("|");
    if (expectedKey !== actualKey) return Response.json({ error: "还有照片或模型没有上传完成，请重试。" }, { status: 409 });

    await getDb().update(sharedArchives).set({ status: "ready" }).where(and(
      eq(sharedArchives.id, id), eq(sharedArchives.status, "uploading"),
    ));
    const latest = await getDb().select({ status: sharedArchives.status }).from(sharedArchives).where(eq(sharedArchives.id, id)).limit(1);
    if (latest[0]?.status !== "ready") return Response.json({ error: "分享页没有完成保存，请重试。" }, { status: 409 });
    return Response.json({ path: `/p/${id}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to publish birthday archive share", error);
    return Response.json({ error: "暂时无法完成分享页，请稍后重试。" }, { status: 503 });
  }
}
