CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` integer NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `check_ins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`as_of` text NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `income_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'salary' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `income_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`valid_from` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`interval` text DEFAULT 'monthly' NOT NULL,
	`thirteenth` integer DEFAULT false NOT NULL,
	`ended` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `income_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `income_versions_source_from` ON `income_versions` (`source_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `item_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`valid_from` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`interval` text DEFAULT 'monthly' NOT NULL,
	`share` integer DEFAULT 100 NOT NULL,
	`ended` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_versions_item_from` ON `item_versions` (`item_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category_id` integer NOT NULL,
	`kind` text DEFAULT 'fixed' NOT NULL,
	`note` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
