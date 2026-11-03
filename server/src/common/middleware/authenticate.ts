import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../config/database";
import { HttpError } from "../errors";
import { verifyAccessToken } from "../../modules/auth/token.service";

export async function authenticate(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authorization = request.header("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    }
    const userId = verifyAccessToken(authorization.slice(7).trim());
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new HttpError(401, "ACCOUNT_INACTIVE", "Authentication is required");
    }
    request.user = { id: user.id };
    next();
  } catch (error) {
    next(error);
  }
}
