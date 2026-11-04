import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { SttProvider } from "./gnani.adapter";
import type { TtsProvider } from "./timbre.adapter";

export type VoiceSessionLifecycleState =
  | "CREATED"
  | "CONNECTING"
  | "ACTIVE"
  | "RECONNECTING"
  | "CLOSING"
  | "CLOSED"
  | "FAILED";

export interface VoiceSession {
  sessionId: string;
  userId: string;
  conversationId: string;
  formTaskId?: string;
  language?: string;
  state: VoiceSessionLifecycleState;
  createdAt: number;
  lastActiveAt: number;
  socket?: WebSocket;
  provider?: SttProvider;
  tts?: TtsProvider;
  closeReason?: string;
  cleanupExecuted: boolean;
}

export interface SessionDiagnosticItem {
  sessionId: string;
  conversationId: string;
  state: VoiceSessionLifecycleState;
  createdAt: string;
  lastActiveAt: string;
}

export class VoiceSessionRegistry {
  private sessions = new Map<string, VoiceSession>();
  private userSessions = new Map<string, Set<string>>();
  private heartbeatTimer?: NodeJS.Timeout;
  private readonly maxActivePerUser: number;
  private readonly sessionTtlMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly staleThresholdMs: number;

  constructor(options?: {
    maxActivePerUser?: number;
    sessionTtlMs?: number;
    heartbeatIntervalMs?: number;
    staleThresholdMs?: number;
  }) {
    this.maxActivePerUser = options?.maxActivePerUser ?? 2;
    this.sessionTtlMs = options?.sessionTtlMs ?? 15 * 60 * 1000; // 15 minutes max session
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 15000; // 15 second ping
    this.staleThresholdMs = options?.staleThresholdMs ?? 30000; // 30 seconds idle/unresponsive
  }

  /**
   * Safe privacy-conscious logging: session ID, masked user identifier, transition, count, reason.
   * Never logs transcripts, audio bytes, form values or tokens.
   */
  private logLifecycle(
    event: string,
    data: {
      sessionId?: string;
      userId: string;
      conversationId?: string;
      oldState?: string;
      state?: string;
      activeCount: number;
      reason: string;
    },
  ): void {
    const safeUserId = data.userId.length > 8
      ? `${data.userId.slice(0, 4)}...${data.userId.slice(-4)}`
      : data.userId;
    console.log(
      `[VoiceLifecycle][${event}] session=${data.sessionId ?? "none"} user=${safeUserId} transition=${data.oldState ?? "NONE"}->${data.state ?? "NONE"} activeCount=${data.activeCount} reason=${data.reason}`,
    );
  }

  /**
   * Prune stale or already-dead sessions for a specific user before acquiring a slot.
   */
  public pruneStaleSessionsForUser(userId: string): void {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds || sessionIds.size === 0) return;

    const now = Date.now();
    for (const sessionId of Array.from(sessionIds)) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        sessionIds.delete(sessionId);
        continue;
      }

      // Check if session has exceeded terminal state or cleanup
      if (session.state === "CLOSED" || session.state === "FAILED" || session.cleanupExecuted) {
        this.releaseSession(sessionId, "TERMINAL_STATE_PRUNED");
        continue;
      }

      // Check if upgrade was abandoned (CREATED without WebSocket attached for > 10s)
      if (session.state === "CREATED" && !session.socket && now - session.createdAt > 10000) {
        this.releaseSession(sessionId, "ABANDONED_UPGRADE_TIMEOUT");
        continue;
      }

      // Check if WebSocket is already closed
      if (session.socket && (session.socket.readyState === session.socket.CLOSED || session.socket.readyState === session.socket.CLOSING)) {
        this.releaseSession(sessionId, "SOCKET_CLOSED_DETECTED");
        continue;
      }

      // Check if session has exceeded max lifetime TTL
      if (now - session.createdAt > this.sessionTtlMs) {
        this.releaseSession(sessionId, "SESSION_TTL_EXPIRED");
        continue;
      }
    }

    if (sessionIds.size === 0) {
      this.userSessions.delete(userId);
    }
  }

  /**
   * Atomically acquire a concurrency slot for a user.
   */
  public acquireSessionSlot(
    userId: string,
    conversationId: string,
    formTaskId?: string,
    language?: string,
  ): { allowed: true; session: VoiceSession } | { allowed: false; error: string; activeCount: number } {
    // 1. Prune stale / disconnected sessions for this user first
    this.pruneStaleSessionsForUser(userId);

    const userSet = this.userSessions.get(userId) ?? new Set<string>();
    const currentActiveCount = userSet.size;

    if (currentActiveCount >= this.maxActivePerUser) {
      this.logLifecycle("REJECTED", {
        userId,
        conversationId,
        activeCount: currentActiveCount,
        reason: "MAX_ACTIVE_PER_USER_REACHED",
      });
      return { allowed: false, error: "MAX_ACTIVE_REACHED", activeCount: currentActiveCount };
    }

    const sessionId = randomUUID();
    const now = Date.now();
    const session: VoiceSession = {
      sessionId,
      userId,
      conversationId,
      formTaskId,
      language,
      state: "CREATED",
      createdAt: now,
      lastActiveAt: now,
      cleanupExecuted: false,
    };

    this.sessions.set(sessionId, session);
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);

    this.logLifecycle("ACQUIRED", {
      sessionId,
      userId,
      conversationId,
      state: "CREATED",
      activeCount: this.userSessions.get(userId)!.size,
      reason: "SLOT_ACQUIRED",
    });

    return { allowed: true, session };
  }

  /**
   * Attach active WebSocket, STT provider and TTS provider to the session.
   */
  public attachResources(
    sessionId: string,
    socket: WebSocket,
    provider: SttProvider,
    tts: TtsProvider,
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.cleanupExecuted) {
      return false;
    }

    session.socket = socket;
    session.provider = provider;
    session.tts = tts;
    session.lastActiveAt = Date.now();

    // Attach ping/pong heartbeat tracking
    (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
    socket.on("pong", () => {
      (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
      session.lastActiveAt = Date.now();
    });

    this.transitionState(sessionId, "CONNECTING", "WEBSOCKET_ATTACHED");
    return true;
  }

  /**
   * Transition session state with lifecycle validation.
   */
  public transitionState(
    sessionId: string,
    nextState: VoiceSessionLifecycleState,
    reason?: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.state === "CLOSED" || session.state === "FAILED") {
      return; // Terminal state cannot transition
    }

    const oldState = session.state;
    session.state = nextState;
    session.lastActiveAt = Date.now();
    if (reason) session.closeReason = reason;

    const count = this.userSessions.get(session.userId)?.size ?? 0;
    this.logLifecycle("STATE_TRANSITION", {
      sessionId,
      userId: session.userId,
      conversationId: session.conversationId,
      oldState,
      state: nextState,
      activeCount: count,
      reason: reason ?? "NORMAL_TRANSITION",
    });
  }

  /**
   * Release session capacity exactly once. Keyed to sessionId so old sessions cannot release newer sessions.
   */
  public releaseSession(
    sessionId: string,
    reason: string,
    terminalState: "CLOSED" | "FAILED" = "CLOSED",
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.cleanupExecuted) {
      return; // Already cleaned up - release exactly once
    }

    session.cleanupExecuted = true;
    const oldState = session.state;
    session.state = terminalState;
    session.closeReason = reason;
    session.lastActiveAt = Date.now();

    // Clean up hardware / network resources
    try { session.provider?.close(); } catch {}
    try { session.tts?.close(); } catch {}
    try {
      if (session.socket && session.socket.readyState !== session.socket.CLOSED) {
        session.socket.close();
      }
    } catch {}

    // Decrement user active set
    const userSet = this.userSessions.get(session.userId);
    if (userSet) {
      userSet.delete(sessionId);
      if (userSet.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    this.sessions.delete(sessionId);

    const remainingCount = this.userSessions.get(session.userId)?.size ?? 0;
    this.logLifecycle("RELEASED", {
      sessionId,
      userId: session.userId,
      conversationId: session.conversationId,
      oldState,
      state: terminalState,
      activeCount: remainingCount,
      reason,
    });
  }

  /**
   * Periodic sweep of dead/unresponsive sockets and abandoned upgrades.
   */
  public sweepHeartbeats(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (!session.socket) {
        if (now - session.createdAt > 10000) {
          this.releaseSession(sessionId, "ABANDONED_UPGRADE_TIMEOUT");
        }
        continue;
      }

      if (session.socket.readyState === session.socket.CLOSED) {
        this.releaseSession(sessionId, "SOCKET_CLOSED_DETECTED");
        continue;
      }

      if (now - session.createdAt > this.sessionTtlMs) {
        this.releaseSession(sessionId, "SESSION_TTL_EXPIRED");
        continue;
      }

      const ws = session.socket as WebSocket & { isAlive?: boolean };
      if (ws.readyState === ws.OPEN) {
        if (ws.isAlive === false) {
          this.releaseSession(sessionId, "HEARTBEAT_TIMEOUT_NO_PONG");
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {
          this.releaseSession(sessionId, "PING_ERROR");
        }
      }
    }
  }

  public startHeartbeat(intervalMs?: number): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.sweepHeartbeats();
    }, intervalMs ?? this.heartbeatIntervalMs);
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Diagnostic summary for authenticated user.
   */
  public getUserDiagnostic(userId: string): {
    activeCount: number;
    maxAllowed: number;
    sessions: SessionDiagnosticItem[];
  } {
    this.pruneStaleSessionsForUser(userId);
    const sessionIds = this.userSessions.get(userId) ?? new Set<string>();
    const list: SessionDiagnosticItem[] = [];

    for (const sid of sessionIds) {
      const s = this.sessions.get(sid);
      if (s) {
        list.push({
          sessionId: s.sessionId,
          conversationId: s.conversationId,
          state: s.state,
          createdAt: new Date(s.createdAt).toISOString(),
          lastActiveAt: new Date(s.lastActiveAt).toISOString(),
        });
      }
    }

    return {
      activeCount: list.length,
      maxAllowed: this.maxActivePerUser,
      sessions: list,
    };
  }

  /**
   * Total active session count across all users (for diagnostics and tests).
   */
  public getActiveCount(userId?: string): number {
    if (userId) {
      this.pruneStaleSessionsForUser(userId);
      return this.userSessions.get(userId)?.size ?? 0;
    }
    return this.sessions.size;
  }

  /**
   * Clear all active sessions (used in test setup and server shutdown).
   */
  public clear(): void {
    this.stopHeartbeat();
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.releaseSession(sessionId, "REGISTRY_CLEARED");
    }
    this.sessions.clear();
    this.userSessions.clear();
  }
}

export const defaultVoiceSessionRegistry = new VoiceSessionRegistry();

