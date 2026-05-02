CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`last_modified` integer NOT NULL,
	`curr_node` text,
	`mcp_server_overrides` text,
	`forked_from_conversation_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conv_id` text NOT NULL,
	`type` text NOT NULL,
	`timestamp` integer NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`parent_id` text,
	`reasoning_content` text,
	`tool_calls` text,
	`tool_call_id` text,
	`extra` text,
	`timings` text,
	`model` text,
	`is_pin` integer,
	FOREIGN KEY (`conv_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_conv_last_modified` ON `conversations` (`last_modified`);
--> statement-breakpoint
CREATE INDEX `idx_conv_forked` ON `conversations` (`forked_from_conversation_id`);
--> statement-breakpoint
CREATE INDEX `idx_msg_conv_id` ON `messages` (`conv_id`);
--> statement-breakpoint
CREATE INDEX `idx_msg_parent` ON `messages` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `idx_msg_timestamp` ON `messages` (`timestamp`);
