CREATE TABLE "reading_log_qa" (
	"id" serial PRIMARY KEY NOT NULL,
	"reading_log_id" integer NOT NULL,
	"question_index" integer NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"feedback" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_log_qa" ADD CONSTRAINT "reading_log_qa_reading_log_id_reading_logs_id_fk" FOREIGN KEY ("reading_log_id") REFERENCES "public"."reading_logs"("id") ON DELETE no action ON UPDATE no action;