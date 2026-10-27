ALTER TABLE `check_ins` ADD `note` text;--> statement-breakpoint
ALTER TABLE `check_ins` ADD `snapshot` text;--> statement-breakpoint
ALTER TABLE `income_sources` ADD `counted` integer DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE `income_sources` SET `counted` = 0 WHERE `type` IN ('bonus', 'expenses');
