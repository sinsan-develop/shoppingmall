CREATE TABLE auth_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  email text NOT NULL,
  account_id uuid REFERENCES accounts(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_action_tokens_purpose_ck CHECK (purpose IN ('admin_setup', 'customer_signup', 'password_reset')),
  CONSTRAINT auth_action_tokens_email_ck CHECK (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
  CONSTRAINT auth_action_tokens_hash_ck CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_action_tokens_expiry_ck CHECK (expires_at > created_at),
  CONSTRAINT auth_action_tokens_account_ck CHECK ((purpose = 'customer_signup') = (account_id IS NULL))
);--> statement-breakpoint
CREATE INDEX auth_action_tokens_lookup_idx ON auth_action_tokens(purpose, email, created_at DESC);--> statement-breakpoint
CREATE INDEX auth_action_tokens_expiry_idx ON auth_action_tokens(expires_at);--> statement-breakpoint
CREATE TABLE seller_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  seller_id uuid REFERENCES sellers(id),
  reviewed_by_account_id uuid REFERENCES accounts(id),
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_applications_status_ck CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT seller_applications_name_ck CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  CONSTRAINT seller_applications_review_ck CHECK (
    (status = 'pending' AND seller_id IS NULL AND reviewed_by_account_id IS NULL AND reviewed_at IS NULL)
    OR (status = 'approved' AND seller_id IS NOT NULL AND reviewed_by_account_id IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (status = 'rejected' AND seller_id IS NULL AND reviewed_by_account_id IS NOT NULL AND reviewed_at IS NOT NULL AND length(trim(coalesce(review_reason, ''))) > 0)
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX seller_applications_one_pending_uq ON seller_applications(account_id) WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX seller_applications_status_created_idx ON seller_applications(status, created_at DESC);--> statement-breakpoint
CREATE TABLE auth_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  result_code text NOT NULL,
  subject_hash text NOT NULL,
  source_hash text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_security_events_purpose_ck CHECK (purpose IN ('admin_setup', 'customer_signup', 'password_reset', 'seller_application')),
  CONSTRAINT auth_security_events_subject_hash_ck CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_security_events_source_hash_ck CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_security_events_result_ck CHECK (length(trim(result_code)) BETWEEN 1 AND 80)
);--> statement-breakpoint
CREATE INDEX auth_security_events_subject_idx ON auth_security_events(purpose, subject_hash, occurred_at DESC);--> statement-breakpoint
CREATE INDEX auth_security_events_source_idx ON auth_security_events(purpose, source_hash, occurred_at DESC) WHERE source_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX auth_security_events_retention_idx ON auth_security_events(occurred_at);
