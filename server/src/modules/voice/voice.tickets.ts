import { randomBytes } from "node:crypto";
import { HttpError } from "../../common/errors";
import { getOwnedConversation } from "../conversations/conversation.service";

const TICKET_TTL_MS = 60 * 1000;
const tickets = new Map<string, { userId: string; conversationId: string; formTaskId?: string; language?: string; expiresAt: number }>();

export function pruneExpiredTickets(): number {
  const now = Date.now();
  let pruned = 0;
  for (const [ticket, entry] of tickets.entries()) {
    if (entry.expiresAt <= now) {
      tickets.delete(ticket);
      pruned++;
    }
  }
  return pruned;
}

export async function issueVoiceTicket(
  userId: string,
  conversationId: string,
  formTaskId?: string,
  language?: string,
): Promise<{ ticket: string; expiresAt: string }> {
  pruneExpiredTickets();
  const conversation = await getOwnedConversation(userId, conversationId);
  if (conversation.status !== "ACTIVE") throw new HttpError(409, "CONVERSATION_NOT_ACTIVE", "Only active conversations can use voice sessions");
  const ticket = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + TICKET_TTL_MS;
  tickets.set(ticket, { userId, conversationId, formTaskId, language, expiresAt });
  return { ticket, expiresAt: new Date(expiresAt).toISOString() };
}

export function consumeVoiceTicket(ticket: string): { userId: string; conversationId: string; formTaskId?: string; language?: string } | undefined {
  pruneExpiredTickets();
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  if (!entry || entry.expiresAt <= Date.now()) return undefined;
  return { userId: entry.userId, conversationId: entry.conversationId, formTaskId: entry.formTaskId, language: entry.language };
}

export function clearVoiceTickets(): void {
  tickets.clear();
}
