CREATE TABLE auth_intake_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  email text NOT NULL,
  source_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error_code text,
  CONSTRAINT auth_intake_jobs_purpose_ck CHECK (purpose IN ('customer_signup','password_reset')),
  CONSTRAINT auth_intake_jobs_email_ck CHECK (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
  CONSTRAINT auth_intake_jobs_source_ck CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_intake_jobs_status_ck CHECK (status IN ('pending','processing','done','dead')),
  CONSTRAINT auth_intake_jobs_attempts_ck CHECK (attempts BETWEEN 0 AND 5),
  CONSTRAINT auth_intake_jobs_expiry_ck CHECK (expires_at > created_at),
  CONSTRAINT auth_intake_jobs_error_ck CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 80)
);--> statement-breakpoint
CREATE INDEX auth_intake_jobs_ready_idx ON auth_intake_jobs(status,available_at,created_at,id)
  WHERE status IN ('pending','processing');--> statement-breakpoint
