import express, { type ErrorRequestHandler } from "express";
import { authRoutes, userRoutes } from "./modules/auth/auth.routes";
import { isHttpError } from "./common/errors";
import { conversationRoutes } from "./modules/conversations/conversation.routes";
import { memoryRoutes } from "./modules/memories/memory.routes";
import { formTaskRoutes } from "./modules/form-tasks/form-task.routes";
import { contextRoutes } from "./modules/context/context.routes";
import { agentRoutes } from "./modules/agent/agent.routes";
import { formIntelligenceRoutes } from "./modules/form-intelligence/form-intelligence.routes";
import { browserRoutes } from "./modules/browser/browser.routes";
import { voiceRoutes } from "./modules/voice/voice.routes";

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/conversations", conversationRoutes);
app.use("/api/v1/memories", memoryRoutes);
app.use("/api/v1/form-tasks", formTaskRoutes);
app.use("/api/v1", contextRoutes);
app.use("/api/v1", agentRoutes);
app.use("/api/v1", formIntelligenceRoutes);
app.use("/api/v1", browserRoutes);
app.use("/api/v1", voiceRoutes);

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (isHttpError(error)) {
    response.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message } });
    return;
  }
  console.error("Unhandled request error", error instanceof Error ? error.message : "unknown error");
  response.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
};
app.use(errorHandler);

if (require.main === module) {
  const { config } = require("./config/environment") as typeof import("./config/environment");
  const { createServer } = require("node:http") as typeof import("node:http");
  const { attachVoiceGateway } = require("./modules/voice/voice.gateway") as typeof import("./modules/voice/voice.gateway");
  const { processVoiceTranscript } = require("./modules/agent/agent.service") as typeof import("./modules/agent/agent.service");
  const server = createServer(app);
  attachVoiceGateway(server, undefined, processVoiceTranscript);
  server.listen(config.port, () => console.log(`BhashaAgent server listening on port ${config.port}`));
}
