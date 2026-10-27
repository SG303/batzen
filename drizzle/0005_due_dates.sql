ALTER TABLE `item_versions` ADD `due_month` integer;--> statement-breakpoint
ALTER TABLE `items` ADD `reserve` integer DEFAULT true NOT NULL;