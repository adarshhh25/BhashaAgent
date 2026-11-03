CREATE TYPE "MemoryDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'OBJECT', 'ARRAY');
CREATE TYPE "ProfileMemoryStatus" AS ENUM ('APPROVED', 'DELETED');

ALTER TABLE "profile_memories"
  ADD COLUMN "data_type" "MemoryDataType" NOT NULL DEFAULT 'STRING',
  ADD COLUMN "status" "ProfileMemoryStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "source_message_id" UUID,
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "memory_change_requests"
  ADD COLUMN "source_message_id" UUID,
  ADD COLUMN "category" VARCHAR(100) NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "rejection_reason" VARCHAR(500);

CREATE INDEX "profile_memories_source_message_id_idx"
  ON "profile_memories"("source_message_id");
CREATE INDEX "profile_memories_user_id_category_key_status_idx"
  ON "profile_memories"("user_id", "category", "key", "status");
CREATE INDEX "memory_change_requests_source_message_id_idx"
  ON "memory_change_requests"("source_message_id");
CREATE INDEX "memory_change_requests_user_id_category_proposed_key_status_idx"
  ON "memory_change_requests"("user_id", "category", "proposed_key", "status");

ALTER TABLE "profile_memories"
  ADD CONSTRAINT "profile_memories_source_message_id_fkey"
  FOREIGN KEY ("source_message_id") REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "memory_change_requests"
  ADD CONSTRAINT "memory_change_requests_source_message_id_fkey"
  FOREIGN KEY ("source_message_id") REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
