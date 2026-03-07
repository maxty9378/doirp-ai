CREATE TABLE "document_revisions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"document_id" varchar(255) NOT NULL,
	"content" text,
	"editor_data" jsonb,
	"metadata" jsonb,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"code" text NOT NULL,
	"token_quota" integer DEFAULT 1000000 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"plain_password" text,
	"daily_image_count" integer DEFAULT 0 NOT NULL,
	"last_image_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_codes" ADD CONSTRAINT "user_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_revisions_document_id_idx" ON "document_revisions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_revisions_user_id_idx" ON "document_revisions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_codes_code_idx" ON "user_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "user_codes_user_id_idx" ON "user_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "documents_deleted_at_idx" ON "documents" USING btree ("deleted_at");