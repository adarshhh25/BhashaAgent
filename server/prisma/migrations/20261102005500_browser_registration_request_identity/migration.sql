ALTER TABLE "browser_page_sessions"
  ADD COLUMN "idempotency_hash" CHAR(64);
