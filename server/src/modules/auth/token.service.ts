import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../../config/environment";
import { HttpError } from "../../common/errors";

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function createAccessToken(userId: string): string {
  return jwt.sign({}, config.jwtAccessSecret, {
    algorithm: "HS256",
    subject: userId,
    jwtid: randomUUID(),
    expiresIn: config.jwtAccessExpiresIn as jwt.SignOptions["expiresIn"],
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });
}

export function verifyAccessToken(token: string): string {
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret, {
      algorithms: ["HS256"],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }) as JwtPayload;
    if (typeof payload.sub !== "string" || !payload.jti) {
      throw new Error("Missing required claims");
    }
    return payload.sub;
  } catch {
    throw new HttpError(401, "INVALID_ACCESS_TOKEN", "Invalid or expired access token");
  }
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + config.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000);
}
