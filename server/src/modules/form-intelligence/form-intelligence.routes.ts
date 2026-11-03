import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { intelligentMapping } from "./form-intelligence.controller";

export const formIntelligenceRoutes = Router();
formIntelligenceRoutes.use(authenticate);
formIntelligenceRoutes.post("/form-tasks/:id/intelligent-mapping", intelligentMapping);
