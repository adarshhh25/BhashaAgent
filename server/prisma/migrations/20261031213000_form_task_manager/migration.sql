CREATE TYPE "FormFieldStatus" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "FieldExecutionStatus" AS ENUM ('NOT_STARTED', 'READY', 'IN_PROGRESS', 'FILLED', 'SKIPPED', 'FAILED');
CREATE TYPE "MappingSource" AS ENUM ('DETERMINISTIC', 'INTERNAL', 'USER');

ALTER TYPE "FormTaskStatus" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "FormTaskStatus" ADD VALUE IF NOT EXISTS 'FIELDS_DETECTED';
ALTER TYPE "FormTaskStatus" ADD VALUE IF NOT EXISTS 'MAPPING_IN_PROGRESS';
ALTER TYPE "FormTaskStatus" ADD VALUE IF NOT EXISTS 'AWAITING_INFORMATION';
ALTER TYPE "FormTaskStatus" ADD VALUE IF NOT EXISTS 'REVIEW';
ALTER TYPE "FormTaskStatus" ADD VALUE IF NOT EXISTS 'AWAITING_FINAL_APPROVAL';
ALTER TYPE "FormTaskStatus" ADD VALUE IF NOT EXISTS 'APPROVED_FOR_FILLING';
ALTER TYPE "FormTaskStatus" ADD VALUE IF NOT EXISTS 'FILLING';
ALTER TYPE "FieldValueSource" ADD VALUE IF NOT EXISTS 'USER_PROVIDED';
ALTER TYPE "FieldValueSource" ADD VALUE IF NOT EXISTS 'APPROVED_PROFILE_MEMORY';
ALTER TYPE "FieldValueSource" ADD VALUE IF NOT EXISTS 'AGENT_PROPOSED';
ALTER TYPE "FieldValueSource" ADD VALUE IF NOT EXISTS 'SYSTEM_DEFAULT';
ALTER TYPE "FieldValueSource" ADD VALUE IF NOT EXISTS 'USER_CORRECTED';
ALTER TYPE "FieldValueStatus" ADD VALUE IF NOT EXISTS 'NOT_REVIEWED';
ALTER TYPE "FieldValueStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';

ALTER TABLE "form_tasks"
  ADD COLUMN "title" VARCHAR(255),
  ADD COLUMN "task_type" VARCHAR(100) NOT NULL DEFAULT 'APPLICATION',
  ADD COLUMN "webpage_metadata" JSONB,
  ADD COLUMN "detected_at" TIMESTAMPTZ(3),
  ADD COLUMN "paused_at" TIMESTAMPTZ(3),
  ADD COLUMN "failed_at" TIMESTAMPTZ(3),
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
  ADD COLUMN "previous_status" "FormTaskStatus",
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "failure_code" VARCHAR(100),
  ADD COLUMN "failure_message" VARCHAR(500);

ALTER TABLE "detected_fields"
  ADD COLUMN "field_key" VARCHAR(255),
  ADD COLUMN "is_disabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_read_only" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "detected_order" INTEGER,
  ADD COLUMN "group_name" VARCHAR(255),
  ADD COLUMN "section_name" VARCHAR(255),
  ADD COLUMN "detection_confidence" DECIMAL(4,3),
  ADD COLUMN "status" "FormFieldStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "field_values"
  ADD COLUMN "execution_status" "FieldExecutionStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "data_type" VARCHAR(30),
  ADD COLUMN "source_memory_id" UUID,
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_attempt_at" TIMESTAMPTZ(3),
  ADD COLUMN "last_error" VARCHAR(500);

ALTER TABLE "task_events" ADD COLUMN "entity_id" UUID;
ALTER TABLE "approvals"
  ADD COLUMN "task_version" INTEGER,
  ADD COLUMN "approved_snapshot" JSONB,
  ADD COLUMN "invalidated_at" TIMESTAMPTZ(3);

CREATE TABLE "field_value_revisions" (
  "id" UUID NOT NULL,
  "field_value_id" UUID NOT NULL,
  "previous_value" JSONB NOT NULL,
  "previous_status" "FieldValueStatus",
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "field_value_revisions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "field_mappings" (
  "id" UUID NOT NULL,
  "form_task_id" UUID NOT NULL,
  "detected_field_id" UUID NOT NULL,
  "source_memory_id" UUID,
  "source_key" VARCHAR(150),
  "confidence" DECIMAL(4,3) NOT NULL,
  "source" "MappingSource" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "field_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "field_mappings_form_task_id_detected_field_id_key"
  ON "field_mappings"("form_task_id", "detected_field_id");
CREATE INDEX "field_mappings_form_task_id_idx" ON "field_mappings"("form_task_id");
CREATE INDEX "field_value_revisions_field_value_id_created_at_idx"
  ON "field_value_revisions"("field_value_id", "created_at");
CREATE INDEX "form_tasks_user_id_created_at_idx" ON "form_tasks"("user_id", "created_at");

ALTER TABLE "field_value_revisions" ADD CONSTRAINT "field_value_revisions_field_value_id_fkey"
  FOREIGN KEY ("field_value_id") REFERENCES "field_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_mappings" ADD CONSTRAINT "field_mappings_form_task_id_fkey"
  FOREIGN KEY ("form_task_id") REFERENCES "form_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_mappings" ADD CONSTRAINT "field_mappings_detected_field_id_fkey"
  FOREIGN KEY ("detected_field_id") REFERENCES "detected_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "field_values"
  ADD CONSTRAINT "field_values_confidence_range_check_v2"
  CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
ALTER TABLE "detected_fields"
  ADD CONSTRAINT "detected_fields_detection_confidence_range_check"
  CHECK ("detection_confidence" IS NULL OR ("detection_confidence" >= 0 AND "detection_confidence" <= 1));
ALTER TABLE "field_mappings"
  ADD CONSTRAINT "field_mappings_confidence_range_check"
  CHECK ("confidence" >= 0 AND "confidence" <= 1);
