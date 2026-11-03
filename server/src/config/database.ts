import { PrismaClient } from "@prisma/client";
import { config } from "./environment";

export const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
});

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
