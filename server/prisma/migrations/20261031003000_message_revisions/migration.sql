CREATE TABLE "message_revisions" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "previous_content" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "revised_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_revisions_message_id_revision_number_key"
ON "message_revisions"("message_id", "revision_number");

CREATE INDEX "message_revisions_message_id_revised_at_idx"
ON "message_revisions"("message_id", "revised_at");

ALTER TABLE "message_revisions"
ADD CONSTRAINT "message_revisions_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "messages"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
