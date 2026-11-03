const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

const configured = dotenv.parse(fs.readFileSync(path.resolve(".env"), "utf8"));
if (!configured.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for database tests");

const testFiles = process.argv.slice(2);
const args = ["--test", "--require", "./tests/support/environment.js", ...testFiles];
const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, TEST_DATABASE_URL: configured.TEST_DATABASE_URL },
});
process.exit(result.status ?? 1);
