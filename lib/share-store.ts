import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { validateArchive, type Archive } from "@/lib/archive";
import { sharedArchives, sharedAssets } from "@/db/schema";

export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
export type SharedAssetKind = "image" | "model";
export type ExpectedAsset = { giftId: string; kind: SharedAssetKind; byteLength: number };

export function makeRandomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

export function originIsSame(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin) && origin === new URL(request.url).origin;
}

export function extractBearer(request: Request) {
  const match = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{40,50})$/);
  return match?.[1] ?? null;
}

export async function getShareRow(id: string) {
  if (!SHARE_ID_PATTERN.test(id)) return undefined;
  const [row] = await getDb().select().from(sharedArchives).where(eq(sharedArchives.id, id)).limit(1);
  return row;
}

export async function authorizeShare(request: Request, id: string) {
  const token = extractBearer(request);
  if (!token || !SHARE_ID_PATTERN.test(id)) return undefined;
  const row = await getShareRow(id);
  if (!row || !safeEqual(await hashToken(token), row.tokenHash)) return undefined;
  return row;
}

export function validateExpectedAssets(input: unknown, archive: Archive): ExpectedAsset[] {
  if (!Array.isArray(input) || input.length > archive.gifts.length * 2) throw new Error("上传文件清单不正确。");
  const giftIds = new Set(archive.gifts.map(gift => gift.id));
  const seen = new Set<string>();
  let total = 0;
  const result = input.map(value => {
    if (!value || typeof value !== "object") throw new Error("上传文件清单不正确。");
    const item = value as Record<string, unknown>;
    const giftId = item.giftId;
    const kind = item.kind;
    const byteLength = item.byteLength;
    if (typeof giftId !== "string" || !giftIds.has(giftId) || (kind !== "image" && kind !== "model")
      || typeof byteLength !== "number" || !Number.isInteger(byteLength) || byteLength <= 0) {
      throw new Error("上传文件清单不正确。");
    }
    const key = giftId + ":" + kind;
    if (seen.has(key)) throw new Error("上传文件清单中有重复文件。");
    seen.add(key);
    const limit = kind === "image" ? 8 * 1024 * 1024 : 20 * 1024 * 1024;
    if (byteLength > limit) throw new Error(kind === "image" ? "单张照片不能超过 8MB。" : "单个模型不能超过 20MB。");
    total += byteLength;
    if (total > 80 * 1024 * 1024) throw new Error("照片和模型合计不能超过 80MB。");
    return { giftId, kind, byteLength };
  });
  return result;
}

export async function loadSharedArchive(id: string): Promise<Archive | null> {
  const row = await getShareRow(id);
  if (!row || row.status !== "ready") return null;
  let archive: Archive;
  try {
    archive = validateArchive(JSON.parse(row.archiveJson));
  } catch {
    return null;
  }
  const assets = await getDb().select().from(sharedAssets).where(eq(sharedAssets.shareId, id));
  const byKey = new Map(assets.map(asset => [asset.giftId + ":" + asset.kind, asset]));
  return {
    ...archive,
    gifts: archive.gifts.map(gift => {
      const image = byKey.get(gift.id + ":image");
      const model = byKey.get(gift.id + ":model");
      return {
        ...gift,
        image: image ? `/api/share/${id}/media/${gift.id}/image` : undefined,
        model: model ? `/api/share/${id}/media/${gift.id}/model` : undefined,
      };
    }),
  };
}

export async function getSharedAsset(id: string, giftId: string, kind: SharedAssetKind) {
  const row = await getShareRow(id);
  if (!row || row.status !== "ready" || !/^[A-Za-z0-9_-]{1,80}$/.test(giftId)) return null;
  const [asset] = await getDb().select().from(sharedAssets).where(and(
    eq(sharedAssets.shareId, id), eq(sharedAssets.giftId, giftId), eq(sharedAssets.kind, kind),
  )).limit(1);
  if (!asset || !env.BUCKET) return null;
  const object = await env.BUCKET.get(`shares/${id}/${giftId}/${kind}`);
  if (!object) return null;
  return { asset, object };
}
