ALTER TABLE "browser_executions"
  ADD COLUMN "retry_action_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
