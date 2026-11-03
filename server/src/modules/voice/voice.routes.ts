import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import * as controller from "./voice.controller";

export const voiceRoutes = Router();
voiceRoutes.use(authenticate);
voiceRoutes.post("/voice/tickets", controller.createTicket);
