ALTER TABLE "orchestration_requests" DROP CONSTRAINT "orchestration_requests_resolved_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "orchestration_requests" DROP CONSTRAINT "orchestration_requests_resolved_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "orchestration_requests" ADD CONSTRAINT "orchestration_requests_resolved_project_id_projects_id_fk" FOREIGN KEY ("resolved_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_requests" ADD CONSTRAINT "orchestration_requests_resolved_session_id_sessions_id_fk" FOREIGN KEY ("resolved_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;