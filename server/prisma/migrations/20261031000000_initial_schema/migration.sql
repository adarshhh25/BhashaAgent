-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageInputMode" AS ENUM ('TEXT', 'VOICE');

-- CreateEnum
CREATE TYPE "MemoryApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MemoryChangeOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "FormTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FieldValueSource" AS ENUM ('PROFILE_MEMORY', 'CONVERSATION', 'USER_INPUT', 'AI_SUGGESTION');

-- CreateEnum
CREATE TYPE "FieldValueStatus" AS ENUM ('PROPOSED', 'APPROVED', 'FILLED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('PROFILE_MEMORY', 'FORM_FILL', 'FORM_SUBMISSION');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "preferred_language" VARCHAR(20),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "summary" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "input_mode" "MessageInputMode" NOT NULL,
    "language" VARCHAR(20),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_memories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "key" VARCHAR(150) NOT NULL,
    "value" JSONB NOT NULL,
    "source_conversation_id" UUID,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profile_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_change_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conversation_id" UUID,
    "existing_memory_id" UUID,
    "operation" "MemoryChangeOperation" NOT NULL,
    "proposed_key" VARCHAR(150) NOT NULL,
    "proposed_value" JSONB NOT NULL,
    "previous_value" JSONB,
    "status" "MemoryApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memory_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_tasks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "webpage_url" TEXT NOT NULL,
    "webpage_title" VARCHAR(500),
    "domain" VARCHAR(255),
    "status" "FormTaskStatus" NOT NULL DEFAULT 'PENDING',
    "task_metadata" JSONB,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "form_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detected_fields" (
    "id" UUID NOT NULL,
    "form_task_id" UUID NOT NULL,
    "field_identifier" VARCHAR(255) NOT NULL,
    "label" VARCHAR(500) NOT NULL,
    "name" VARCHAR(255),
    "element_type" VARCHAR(50) NOT NULL,
    "input_type" VARCHAR(50) NOT NULL,
    "placeholder" VARCHAR(500),
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "field_metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "detected_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_values" (
    "id" UUID NOT NULL,
    "detected_field_id" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "source" "FieldValueSource" NOT NULL,
    "source_reference_id" UUID,
    "confidence" DECIMAL(4,3),
    "status" "FieldValueStatus" NOT NULL,
    "approved_at" TIMESTAMPTZ(3),
    "filled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_events" (
    "id" UUID NOT NULL,
    "form_task_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "previous_status" "FormTaskStatus",
    "new_status" "FormTaskStatus",
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conversation_id" UUID,
    "form_task_id" UUID,
    "memory_change_request_id" UUID,
    "approval_type" "ApprovalType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approved_payload" JSONB,
    "approved_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" UUID NOT NULL,
    "metadata" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "conversations_user_id_last_message_at_idx" ON "conversations"("user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "profile_memories_user_id_is_approved_idx" ON "profile_memories"("user_id", "is_approved");

-- CreateIndex
CREATE INDEX "profile_memories_source_conversation_id_idx" ON "profile_memories"("source_conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_memories_user_id_category_key_key" ON "profile_memories"("user_id", "category", "key");

-- CreateIndex
CREATE INDEX "memory_change_requests_user_id_status_idx" ON "memory_change_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "memory_change_requests_conversation_id_idx" ON "memory_change_requests"("conversation_id");

-- CreateIndex
CREATE INDEX "memory_change_requests_existing_memory_id_idx" ON "memory_change_requests"("existing_memory_id");

-- CreateIndex
CREATE INDEX "form_tasks_user_id_status_idx" ON "form_tasks"("user_id", "status");

-- CreateIndex
CREATE INDEX "form_tasks_conversation_id_created_at_idx" ON "form_tasks"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "form_tasks_status_idx" ON "form_tasks"("status");

-- CreateIndex
CREATE INDEX "detected_fields_form_task_id_idx" ON "detected_fields"("form_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "detected_fields_form_task_id_field_identifier_key" ON "detected_fields"("form_task_id", "field_identifier");

-- CreateIndex
CREATE INDEX "field_values_detected_field_id_created_at_idx" ON "field_values"("detected_field_id", "created_at");

-- CreateIndex
CREATE INDEX "field_values_status_idx" ON "field_values"("status");

-- CreateIndex
CREATE INDEX "task_events_form_task_id_created_at_idx" ON "task_events"("form_task_id", "created_at");

-- CreateIndex
CREATE INDEX "approvals_user_id_status_idx" ON "approvals"("user_id", "status");

-- CreateIndex
CREATE INDEX "approvals_conversation_id_idx" ON "approvals"("conversation_id");

-- CreateIndex
CREATE INDEX "approvals_form_task_id_idx" ON "approvals"("form_task_id");

-- CreateIndex
CREATE INDEX "approvals_memory_change_request_id_idx" ON "approvals"("memory_change_request_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_memories" ADD CONSTRAINT "profile_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_memories" ADD CONSTRAINT "profile_memories_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_change_requests" ADD CONSTRAINT "memory_change_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_change_requests" ADD CONSTRAINT "memory_change_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_change_requests" ADD CONSTRAINT "memory_change_requests_existing_memory_id_fkey" FOREIGN KEY ("existing_memory_id") REFERENCES "profile_memories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_tasks" ADD CONSTRAINT "form_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_tasks" ADD CONSTRAINT "form_tasks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detected_fields" ADD CONSTRAINT "detected_fields_form_task_id_fkey" FOREIGN KEY ("form_task_id") REFERENCES "form_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_detected_field_id_fkey" FOREIGN KEY ("detected_field_id") REFERENCES "detected_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_form_task_id_fkey" FOREIGN KEY ("form_task_id") REFERENCES "form_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_form_task_id_fkey" FOREIGN KEY ("form_task_id") REFERENCES "form_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_memory_change_request_id_fkey" FOREIGN KEY ("memory_change_request_id") REFERENCES "memory_change_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "field_values"
  ADD CONSTRAINT "field_values_confidence_range_check"
  CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));

ALTER TABLE "approvals"
  ADD CONSTRAINT "approvals_target_type_check"
  CHECK (
    (
      "approval_type" = 'PROFILE_MEMORY'
      AND "memory_change_request_id" IS NOT NULL
      AND "form_task_id" IS NULL
    )
    OR
    (
      "approval_type" IN ('FORM_FILL', 'FORM_SUBMISSION')
      AND "form_task_id" IS NOT NULL
      AND "memory_change_request_id" IS NULL
    )
  );
