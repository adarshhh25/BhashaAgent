import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as controller from "./auth.controller";
import { authenticate } from "../../common/middleware/authenticate";

const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });

export const authRoutes = Router();
authRoutes.post("/register", authRateLimit, controller.register);
authRoutes.post("/login", authRateLimit, controller.login);
authRoutes.post("/refresh", authRateLimit, controller.refresh);
authRoutes.post("/logout", authenticate, controller.logout);
authRoutes.post("/logout-all", authenticate, controller.logoutAll);

export const userRoutes = Router();
userRoutes.use(authenticate);
userRoutes.get("/me", controller.getMe);
userRoutes.patch("/me", controller.updateMe);
userRoutes.patch("/me/password", controller.changePassword);
userRoutes.delete("/me", controller.deleteMe);
