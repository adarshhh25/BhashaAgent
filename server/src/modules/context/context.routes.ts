import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import * as controller from "./context.controller";

export const contextRoutes = Router();
contextRoutes.use(authenticate);
contextRoutes.post("/conversations/:id/context", controller.build);
