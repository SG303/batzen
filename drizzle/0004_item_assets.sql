ALTER TABLE `items` ADD `asset_id` integer REFERENCES assets(id) ON DELETE set null;
