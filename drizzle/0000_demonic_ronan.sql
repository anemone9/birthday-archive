CREATE TABLE `shared_archives` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_json` text NOT NULL,
	`expected_assets_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shared_assets` (
	`share_id` text NOT NULL,
	`gift_id` text NOT NULL,
	`kind` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	PRIMARY KEY(`share_id`, `gift_id`, `kind`),
	FOREIGN KEY (`share_id`) REFERENCES `shared_archives`(`id`) ON UPDATE no action ON DELETE cascade
);
