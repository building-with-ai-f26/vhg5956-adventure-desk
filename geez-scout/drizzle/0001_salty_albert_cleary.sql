CREATE TABLE `qa_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_json` text NOT NULL,
	`candidates_json` text NOT NULL,
	`loaded` integer NOT NULL,
	`target` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qa_search_retry` ON `qa_searches` (`session_id`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `qa_sessions` ADD `name_key` text;--> statement-breakpoint
ALTER TABLE `qa_sessions` ADD `chosen_code_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `qa_session_chosen_name` ON `qa_sessions` (`name_key`);