import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sharedArchives = sqliteTable("shared_archives", {
  id: text("id").primaryKey(),
  archiveJson: text("archive_json").notNull(),
  expectedAssetsJson: text("expected_assets_json").notNull().default("[]"),
  status: text("status").notNull().default("uploading"),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sharedAssets = sqliteTable("shared_assets", {
  shareId: text("share_id").notNull().references(() => sharedArchives.id, { onDelete: "cascade" }),
  giftId: text("gift_id").notNull(),
  kind: text("kind").notNull(),
  contentType: text("content_type").notNull(),
  byteLength: integer("byte_length").notNull(),
}, (table) => [
  primaryKey({ columns: [table.shareId, table.giftId, table.kind] }),
]);