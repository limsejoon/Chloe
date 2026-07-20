CREATE TABLE "attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"word_id" integer NOT NULL,
	"mode" text NOT NULL,
	"round" integer,
	"user_answer" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"feedback" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_progress" (
	"word_id" integer PRIMARY KEY NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"missed_this_round" boolean DEFAULT false NOT NULL,
	"wrong_rounds" integer[] DEFAULT '{}' NOT NULL,
	"retired" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wordbooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "wordbooks_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" serial PRIMARY KEY NOT NULL,
	"wordbook_id" integer NOT NULL,
	"day" integer NOT NULL,
	"word" text NOT NULL,
	CONSTRAINT "words_wordbook_id_day_word_unique" UNIQUE("wordbook_id","day","word")
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_progress" ADD CONSTRAINT "word_progress_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_wordbook_id_wordbooks_id_fk" FOREIGN KEY ("wordbook_id") REFERENCES "public"."wordbooks"("id") ON DELETE no action ON UPDATE no action;