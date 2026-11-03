import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import * as controller from "./browser.controller";

export const browserRoutes = Router();
browserRoutes.use(authenticate);
browserRoutes.post("/browser/register", controller.register);
browserRoutes.get("/browser/tasks/:taskId/mappings", controller.mappings);
browserRoutes.post("/browser/instructions", controller.issue);
browserRoutes.post("/browser/executions/:executionId/acknowledge", controller.acknowledge);
browserRoutes.post("/browser/executions/:executionId/retry", controller.retry);
browserRoutes.post("/browser/executions/:executionId/cancel", controller.cancel);
browserRoutes.get("/browser/executions/:executionId", controller.status);
