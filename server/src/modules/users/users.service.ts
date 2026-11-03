import { prisma } from "../../config/database";
import { HttpError } from "../../common/errors";
import { hashPassword, verifyPassword } from "../auth/password.service";

export const safeUserSelect = {
  id: true,
  fullName: true,
  email: true,
  preferredLanguage: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: safeUserSelect });
  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "User not found");
  return user;
}

export async function updateUser(
  userId: string,
  data: { fullName?: string; preferredLanguage?: string | null },
) {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: safeUserSelect,
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(401, "INVALID_PASSWORD", "Current password is incorrect");
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, "PASSWORD_UNCHANGED", "New password must differ from the current password");
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({ where: { id: userId }, data: { passwordHash } });
    await transaction.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}

export async function deleteAccount(userId: string, currentPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(401, "INVALID_PASSWORD", "Current password is incorrect");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.approval.deleteMany({ where: { userId } });
    await transaction.auditLog.updateMany({ where: { userId }, data: { userId: null } });
    const tasks = await transaction.formTask.findMany({ where: { userId }, select: { id: true } });
    for (const task of tasks) {
      await transaction.taskEvent.deleteMany({ where: { formTaskId: task.id } });
      await transaction.detectedField.deleteMany({ where: { formTaskId: task.id } });
    }
    await transaction.formTask.deleteMany({ where: { userId } });
    await transaction.memoryChangeRequest.deleteMany({ where: { userId } });
    await transaction.profileMemory.deleteMany({ where: { userId } });
    await transaction.conversation.deleteMany({ where: { userId } });
    await transaction.refreshToken.deleteMany({ where: { userId } });
    await transaction.user.delete({ where: { id: userId } });
  });
}
