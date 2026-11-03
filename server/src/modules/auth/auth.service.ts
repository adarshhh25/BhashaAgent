import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { HttpError } from "../../common/errors";
import { hashPassword, verifyPassword } from "./password.service";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from "./token.service";
import { safeUserSelect } from "../users/users.service";

const invalidCredentials = () =>
  new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");

export async function register(input: {
  fullName: string;
  email: string;
  password: string;
  preferredLanguage?: string;
}) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        preferredLanguage: input.preferredLanguage,
      },
      select: safeUserSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "EMAIL_IN_USE", "An account with that email already exists");
    }
    throw error;
  }
}

async function issueTokens(userId: string) {
  const refreshToken = createRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
    },
  });
  return {
    accessToken: createAccessToken(userId),
    refreshToken,
    expiresIn: 900,
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw invalidCredentials();
  if (user.status !== "ACTIVE") {
    throw new HttpError(403, "ACCOUNT_INACTIVE", "This account is not active");
  }
  return {
    user: await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: safeUserSelect }),
    ...(await issueTokens(user.id)),
  };
}

export async function refresh(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: { select: { id: true, status: true } } },
      });
      if (!current || current.expiresAt <= new Date() || current.revokedAt || current.user.status !== "ACTIVE") {
        if (current?.revokedAt) {
          await transaction.refreshToken.updateMany({
            where: { userId: current.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return { reuseDetected: true as const };
        }
        return null;
      }
      const revoked = await transaction.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        await transaction.refreshToken.updateMany({
          where: { userId: current.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { reuseDetected: true as const };
      }
      const replacement = createRefreshToken();
      await transaction.refreshToken.create({
        data: {
          userId: current.userId,
          tokenHash: hashRefreshToken(replacement),
          expiresAt: refreshTokenExpiry(),
        },
      });
      return {
        accessToken: createAccessToken(current.userId),
        refreshToken: replacement,
        expiresIn: 900,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (!result) {
      throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Invalid or expired refresh token");
    }
    if ("reuseDetected" in result) {
      throw new HttpError(401, "REFRESH_TOKEN_REUSED", "Refresh token reuse detected");
    }
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Invalid or expired refresh token");
  }
}

export async function revokeRefreshToken(refreshToken: string, userId?: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(refreshToken), ...(userId ? { userId } : {}) },
    data: { revokedAt: new Date() },
  });
}

export function revokeAllRefreshTokens(userId: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
