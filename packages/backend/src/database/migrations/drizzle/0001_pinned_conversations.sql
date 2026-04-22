ALTER TABLE `conversations` ADD COLUMN `pinned` integer;
--> statement-breakpoint
ALTER TABLE `messages` DROP COLUMN `is_pin`;
