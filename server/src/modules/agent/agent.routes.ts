import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../common/middleware/authenticate";
import * as controller from "./agent.controller";

export const agentRoutes = Router();
agentRoutes.use(authenticate);
const agentRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
agentRoutes.post("/conversations/:id/turns", agentRateLimit, controller.turn);
