import type { UserIdentity } from "../../modules/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      user?: UserIdentity;
    }
  }
}

export {};
