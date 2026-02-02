CREATE TABLE "orchestration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text,
	"content" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_project_id" uuid,
	"resolved_session_id" uuid,
	"resolution_confidence" text,
	"resolution_reasoning" text,
	"error_message" text,
	"model_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orchestration_requests" ADD CONSTRAINT "orchestration_requests_resolved_project_id_projects_id_fk" FOREIGN KEY ("resolved_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_requests" ADD CONSTRAINT "orchestration_requests_resolved_session_id_sessions_id_fk" FOREIGN KEY ("resolved_session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;