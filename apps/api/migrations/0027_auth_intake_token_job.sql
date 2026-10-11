ALTER TABLE auth_action_tokens ADD COLUMN intake_job_id uuid
  REFERENCES auth_intake_jobs(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE auth_action_tokens ADD COLUMN delivery_failed_at timestamptz;--> statement-breakpoint
CREATE INDEX auth_action_tokens_intake_job_idx ON auth_action_tokens(intake_job_id)
  WHERE intake_job_id IS NOT NULL;--> statement-breakpoint
