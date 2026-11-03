ALTER TABLE "browser_page_sessions" ADD COLUMN "idempotency_key" VARCHAR(255);
UPDATE "browser_page_sessions" SET "idempotency_key" = "id"::text WHERE "idempotency_key" IS NULL;
ALTER TABLE "browser_page_sessions" ALTER COLUMN "idempotency_key" SET NOT NULL;
CREATE UNIQUE INDEX "browser_page_sessions_user_id_idempotency_key_key" ON "browser_page_sessions"("user_id", "idempotency_key");
