CREATE TABLE "github_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pat_encrypted" text,
	"pat_nonce" text,
	"username" text,
	"author_name" text,
	"author_email" text,
	"attribute_agent" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
