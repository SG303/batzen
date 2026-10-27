CREATE TABLE `asset_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`valid_from` text NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`ended` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_versions_asset_from` ON `asset_versions` (`asset_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'account' NOT NULL,
	`provider` text,
	`note` text
);
