CREATE TABLE `qa_auth_tokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`session_id` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qa_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`mode` text NOT NULL,
	`question` text NOT NULL,
	`evidence` text NOT NULL,
	`model` text NOT NULL,
	`output` text,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`expires_at` integer NOT NULL,
	`lease_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qa_job_retry` ON `qa_jobs` (`session_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `qa_job_queue` ON `qa_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `qa_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qa_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`saving` integer NOT NULL,
	`code_hash` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qa_session_code` ON `qa_sessions` (`code_hash`);--> statement-breakpoint
CREATE TABLE `qa_worker` (
	`id` text PRIMARY KEY NOT NULL,
	`worker_id` text NOT NULL,
	`model` text NOT NULL,
	`seen_at` integer NOT NULL
);
