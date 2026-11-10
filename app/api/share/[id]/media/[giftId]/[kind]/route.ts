import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { assertEmbeddedGLB } from "@/lib/archive";
import { authorizeShare, getSharedAsset, originIsSame, type SharedAssetKind } from "@/lib/share-store";
import { sharedAssets } from "@/db/schema";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; giftId: string; kind: string }> };

function detectImage(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return "image/png";
  if (bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
  return null;
}

export async function GET(_request: Request, { params }: Context) {
  const { id, giftId, kind } = await params;
  if (kind !== "image" && kind !== "model") return new Response("Not found", { status: 404 });
  const result = await getSharedAsset(id, giftId, kind as SharedAssetKind);
  if (!result) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const headers = new Headers({
    "Content-Type": result.asset.contentType,
    "Content-Length": String(result.object.size),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  });
  if (result.object.httpEtag) headers.set("ETag", result.object.httpEtag);
  result.object.writeHttpMetadata(headers);
  headers.set("Content-Type", result.asset.contentType);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "private, no-store");
  return new Response(result.object.body, { headers });
}

export async function PUT(request: Request, { params }: Context) {
  const { id, giftId, kind } = await params;
  if (kind !== "image" && kind !== "model") return Response.json({ error: "文件类型不支持。" }, { status: 400 });
  if (!originIsSame(request)) return Response.json({ error: "请从生日档案页面上传文件。" }, { status: 403 });
  if (!env.BUCKET) return Response.json({ error: "文件存储暂时不可用。" }, { status: 503 });
  const row = await authorizeShare(request, id);
  if (!row || row.status !== "uploading") return Response.json({ error: "上传凭证无效或已失效。" }, { status: 403 });

  try {
    const expected = JSON.parse(row.expectedAssetsJson) as Array<{ giftId: string; kind: SharedAssetKind; byteLength: number }>;
    const item = expected.find(asset => asset.giftId === giftId && asset.kind === kind);
    if (!item) return Response.json({ error: "这份礼物没有待上传的文件。" }, { status: 400 });
    const limit = kind === "image" ? 8 * 1024 * 1024 : 20 * 1024 * 1024;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > limit || (contentLength && contentLength !== item.byteLength)) return Response.json({ error: "文件大小和清单不匹配。" }, { status: 413 });
    const buffer = await request.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > limit || buffer.byteLength !== item.byteLength) return Response.json({ error: "文件大小和清单不匹配。" }, { status: 413 });
    const bytes = new Uint8Array(buffer);
    let contentType: string;
    if (kind === "image") {
      const detected = detectImage(bytes);
      if (!detected || request.headers.get("content-type") !== detected) return Response.json({ error: "照片请选择有效的 PNG、JPEG 或 WebP 文件。" }, { status: 400 });
      contentType = detected;
    } else {
      const declared = request.headers.get("content-type");
      if (declared !== "model/gltf-binary" && declared !== "application/octet-stream") return Response.json({ error: "模型文件格式不正确。" }, { status: 400 });
      assertEmbeddedGLB(buffer);
      contentType = "model/gltf-binary";
    }

    const key = `shares/${id}/${giftId}/${kind}`;
    await env.BUCKET.put(key, buffer, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } });
    try {
      await getDb().insert(sharedAssets).values({
        shareId: id, giftId, kind, contentType, byteLength: buffer.byteLength,
      }).onConflictDoUpdate({
        target: [sharedAssets.shareId, sharedAssets.giftId, sharedAssets.kind],
        set: { contentType, byteLength: buffer.byteLength },
      });
    } catch (error) {
      await env.BUCKET.delete(key);
      throw error;
    }
    return Response.json({ uploaded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("GLB") || message.includes("模型") || message.includes("不完整") || message.includes("贴图") || message.includes("区块") || message.includes("压缩")) {
      return Response.json({ error: message }, { status: 400 });
    }
    console.error("Unable to upload birthday archive media", error);
    return Response.json({ error: "照片或模型上传失败，请重试。" }, { status: 503 });
  }
}
