import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import * as controller from "./memory.controller";

export const memoryRoutes = Router();
memoryRoutes.use(authenticate);
memoryRoutes.get("/", controller.listMemories);
memoryRoutes.get("/proposals", controller.listProposals);
memoryRoutes.post("/proposals", controller.createProposal);
memoryRoutes.post("/proposals/:id/approve", controller.approveProposal);
memoryRoutes.post("/proposals/:id/reject", controller.rejectProposal);
memoryRoutes.post("/extract", controller.extractCandidates);
memoryRoutes.patch("/:id", controller.editMemory);
memoryRoutes.delete("/:id", controller.deleteMemory);
