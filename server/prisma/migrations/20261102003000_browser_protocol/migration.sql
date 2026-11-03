CREATE TYPE "BrowserExecutionStatus" AS ENUM ('ISSUED', 'IN_PROGRESS', 'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "BrowserActionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED');

CREATE TABLE "browser_page_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "form_task_id" UUID NOT NULL,
  "protocol_version" VARCHAR(50) NOT NULL,
  "page_url" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "hostname" VARCHAR(255) NOT NULL,
  "page_title" VARCHAR(500),
  "fingerprint" VARCHAR(255),
  "tab_id" VARCHAR(255),
  "detected_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "browser_page_sessions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "browser_executions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "form_task_id" UUID NOT NULL,
  "page_session_id" UUID NOT NULL,
  "approval_id" UUID NOT NULL,
  "protocol_version" VARCHAR(50) NOT NULL,
  "task_version" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "status" "BrowserExecutionStatus" NOT NULL DEFAULT 'ISSUED',
  "instruction" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "cancelled_at" TIMESTAMPTZ(3),
  "acknowledged_at" TIMESTAMPTZ(3),
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "browser_executions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "browser_action_results" (
  "id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "field_id" UUID NOT NULL,
  "action_id" VARCHAR(255) NOT NULL,
  "status" "BrowserActionStatus" NOT NULL,
  "error_code" VARCHAR(100),
  "message" VARCHAR(500),
  "executed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "browser_action_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "browser_executions_user_id_idempotency_key_key" ON "browser_executions"("user_id", "idempotency_key");
CREATE UNIQUE INDEX "browser_action_results_execution_id_field_id_key" ON "browser_action_results"("execution_id", "field_id");
CREATE INDEX "browser_page_sessions_user_id_form_task_id_idx" ON "browser_page_sessions"("user_id", "form_task_id");
CREATE INDEX "browser_executions_form_task_id_status_idx" ON "browser_executions"("form_task_id", "status");
CREATE INDEX "browser_action_results_execution_id_status_idx" ON "browser_action_results"("execution_id", "status");
ALTER TABLE "browser_page_sessions" ADD CONSTRAINT "browser_page_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "browser_page_sessions" ADD CONSTRAINT "browser_page_sessions_form_task_id_fkey" FOREIGN KEY ("form_task_id") REFERENCES "form_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "browser_executions" ADD CONSTRAINT "browser_executions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "browser_executions" ADD CONSTRAINT "browser_executions_form_task_id_fkey" FOREIGN KEY ("form_task_id") REFERENCES "form_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "browser_executions" ADD CONSTRAINT "browser_executions_page_session_id_fkey" FOREIGN KEY ("page_session_id") REFERENCES "browser_page_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "browser_executions" ADD CONSTRAINT "browser_executions_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "browser_action_results" ADD CONSTRAINT "browser_action_results_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "browser_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "browser_action_results" ADD CONSTRAINT "browser_action_results_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "detected_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
