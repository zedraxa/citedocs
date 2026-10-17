CREATE TABLE "pdf_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"zotero_key" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"parent_item_key" text,
	"annotation_type" text DEFAULT 'highlight' NOT NULL,
	"annotation_text" text DEFAULT '' NOT NULL,
	"annotation_comment" text DEFAULT '' NOT NULL,
	"annotation_color" text DEFAULT '#ffd400' NOT NULL,
	"annotation_page_label" text DEFAULT '1' NOT NULL,
	"annotation_sort_index" text DEFAULT '' NOT NULL,
	"annotation_position" jsonb,
	"image_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pdf_annotations" ADD CONSTRAINT "pdf_annotations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_annotations" ADD CONSTRAINT "pdf_annotations_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pdf_annotations_owner_idx" ON "pdf_annotations" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "pdf_annotations_attachment_idx" ON "pdf_annotations" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "pdf_annotations_owner_key_idx" ON "pdf_annotations" USING btree ("owner_user_id","zotero_key");