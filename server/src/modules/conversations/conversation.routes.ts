import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import * as controller from "./conversation.controller";

export const conversationRoutes = Router();
conversationRoutes.use(authenticate);
conversationRoutes.post("/", controller.create);
conversationRoutes.get("/", controller.list);
conversationRoutes.get("/:id/messages", controller.messages);
conversationRoutes.post("/:id/messages", controller.createMessage);
conversationRoutes.patch("/:id/messages/:messageId", controller.correctMessage);
conversationRoutes.get("/:id", controller.retrieve);
conversationRoutes.patch("/:id", controller.update);
conversationRoutes.delete("/:id", controller.remove);
