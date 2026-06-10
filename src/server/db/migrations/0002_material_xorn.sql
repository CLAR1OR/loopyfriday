CREATE TABLE "song_audios" (
	"id" text PRIMARY KEY NOT NULL,
	"song_id" text NOT NULL,
	"recording_id" text NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "recorded_on" date;--> statement-breakpoint
ALTER TABLE "song_audios" ADD CONSTRAINT "song_audios_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_audios" ADD CONSTRAINT "song_audios_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "song_audios_unique" ON "song_audios" USING btree ("song_id","recording_id");--> statement-breakpoint
CREATE INDEX "song_audios_song_idx" ON "song_audios" USING btree ("song_id");