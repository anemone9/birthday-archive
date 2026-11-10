import { getDb } from "@/db";
import { validateArchive } from "@/lib/archive";
import { makeRandomToken, hashToken, originIsSame, validateExpectedAssets } from "@/lib/share-store";
import { sharedArchives } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!originIsSame(request)) return Response.json({ error: "请从生日档案页面开始生成。" }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 250_000) return Response.json({ error: "信件内容过大，请缩短后重试。" }, { status: 413 });

  try {
    const payload = await request.json() as { archive?: unknown; assets?: unknown };
    if (!payload.archive || typeof payload.archive !== "object") throw new Error("没有读取到生日档案内容。");
    const rawGifts = (payload.archive as { gifts?: unknown }).gifts;
    if (!Array.isArray(rawGifts) || rawGifts.some(gift => gift && typeof gift === "object" && ((gift as {image?:unknown}).image || (gift as {model?:unknown}).model))) {
      throw new Error("请重新生成分享页，媒体文件会单独安全上传。");
    }
    const archive = validateArchive(payload.archive);
    const assets = validateExpectedAssets(payload.assets, archive);
    const id = makeRandomToken(24);
    const token = makeRandomToken(32);
    await getDb().insert(sharedArchives).values({
      id,
      archiveJson: JSON.stringify(archive),
      expectedAssetsJson: JSON.stringify(assets),
      status: "uploading",
      tokenHash: await hashToken(token),
    });
    return Response.json({ id, token }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message && /需要填写|不能超过|格式|重复|样式|有效|过大|照片和模型|不支持|不能|清单|选择|版本|没有读取|上传文件|媒体文件/.test(message)) {
      return Response.json({ error: message }, { status: 400 });
    }
    console.error("Unable to create birthday archive share", error);
    return Response.json({ error: "暂时无法生成分享页，请稍后重试。" }, { status: 503 });
  }
}
