const fs = require("node:fs");
const dotenv = require("dotenv");

const configured = dotenv.parse(fs.readFileSync(".env", "utf8"));
const testUrl = process.env.TEST_DATABASE_URL;
const developmentUrl = configured.DATABASE_URL;

if (!testUrl) throw new Error("TEST_DATABASE_URL is required for database tests");
if (!developmentUrl) throw new Error("DATABASE_URL is required for database safety checks");

const identity = (value) => {
  const parsed = new URL(value);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.slice(1).split("/")[0],
  };
};

const testIdentity = identity(testUrl);
const developmentIdentity = identity(developmentUrl);
if (!/_test$/.test(testIdentity.database)) throw new Error("Database tests require a dedicated *_test database");
if (testIdentity.host === developmentIdentity.host
  && testIdentity.port === developmentIdentity.port
  && testIdentity.database === developmentIdentity.database) {
  throw new Error("Database tests cannot use the development database");
}

process.env.DATABASE_URL = testUrl;
