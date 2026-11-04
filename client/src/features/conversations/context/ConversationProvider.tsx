/**
 * Central Conversation Provider
 *
 * Manages conversation list, active conversation, message history,
 * pagination, optimistic turns, agent submission, and failure reconciliation.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Conversation,
  Message,
  SupportedLanguage,
} from '../types/conversation.types';
import { ConversationContext, type ConversationContextValue } from './conversation-context-def';
import { conversationService } from '../services/conversation.service';
import { useAuth } from '../../auth/hooks/useAuth';
import { ApiError, NetworkError } from '../../../services/api/api-errors';

interface ConversationProviderProps {
  children: ReactNode;
}

export function ConversationProvider({ children }: ConversationProviderProps) {
  const { isAuthenticated, user } = useAuth();

  // Conversation List State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listError, setListError] = useState<string | null>(null);

  // Active Conversation State
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  // Turn Composition & Agent State
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);

  // Default language based on user's preference or English
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(() => {
    const pref = user?.preferredLanguage;
    if (pref === 'hi' || pref === 'mr' || pref === 'hinglish') return pref;
    return 'en';
  });

  // Reference for request cancellation on conversation switch
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  /**
   * Refresh conversation list
   */
  const refreshConversations = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingList(true);
    setListError(null);
    try {
      const res = await conversationService.listConversations({ page: 1, limit: 15 });
      setConversations(res.conversations);
      setListPage(1);
      setHasMoreConversations(Boolean(res.pagination.hasMore));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setIsLoadingList(false);
    }
  }, [isAuthenticated]);

  /**
   * Load more conversations (infinite scroll pagination)
   */
  const loadMoreConversations = useCallback(async () => {
    if (!isAuthenticated || isLoadingMoreConversations || !hasMoreConversations) return;
    setIsLoadingMoreConversations(true);
    try {
      const nextPage = listPage + 1;
      const res = await conversationService.listConversations({ page: nextPage, limit: 15 });
      setConversations((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newItems = res.conversations.filter((c) => !existingIds.has(c.id));
        return [...prev, ...newItems];
      });
      setListPage(nextPage);
      setHasMoreConversations(Boolean(res.pagination.hasMore));
    } catch (err) {
      console.error('Failed to load more conversations:', err);
    } finally {
      setIsLoadingMoreConversations(false);
    }
  }, [isAuthenticated, isLoadingMoreConversations, hasMoreConversations, listPage]);

  // Initial load when user becomes authenticated
  useEffect(() => {
    let isMounted = true;

    if (!isAuthenticated) {
      queueMicrotask(() => {
        if (isMounted) {
          setConversations([]);
          setActiveConversationId(null);
          setMessages([]);
        }
      });
      return () => {
        isMounted = false;
      };
    }

    async function loadList() {
      setIsLoadingList(true);
      setListError(null);
      try {
        const res = await conversationService.listConversations({ page: 1, limit: 15 });
        if (isMounted) {
          setConversations(res.conversations);
          setListPage(1);
          setHasMoreConversations(Boolean(res.pagination.hasMore));
        }
      } catch (err) {
        if (isMounted) {
          setListError(err instanceof Error ? err.message : 'Failed to load conversations');
        }
      } finally {
        if (isMounted) {
          setIsLoadingList(false);
        }
      }
    }

    void loadList();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  /**
   * Create a new conversation
   */
  const createConversation = useCallback(
    async (title?: string): Promise<Conversation> => {
      const newConv = await conversationService.createConversation(title);
      setConversations((prev) => [newConv, ...prev]);
      return newConv;
    },
    [],
  );

  /**
   * Rename a conversation
   */
  const renameConversation = useCallback(
    async (id: string, newTitle: string) => {
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      const updated = await conversationService.updateConversation(id, { title: trimmed });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)),
      );
    },
    [],
  );

  /**
   * Archive or unarchive a conversation
   */
  const archiveConversation = useCallback(
    async (id: string, archive: boolean) => {
      const newStatus = archive ? 'ARCHIVED' : 'ACTIVE';
      const updated = await conversationService.updateConversation(id, { status: newStatus });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: updated.status } : c)),
      );
    },
    [],
  );

  /**
   * Soft delete a conversation
   */
  const deleteConversation = useCallback(
    async (id: string) => {
      await conversationService.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    },
    [activeConversationId],
  );

  /**
   * Fetch initial messages for active conversation
   */
  const fetchMessagesForConversation = useCallback(
    async (convId: string) => {
      // Abort previous in-flight requests for clean isolation
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      activeAbortControllerRef.current = controller;

      setIsLoadingMessages(true);
      setMessagesError(null);

      try {
        const res = await conversationService.listMessages(
          convId,
          { page: 1, limit: 30, order: 'asc' },
          controller.signal,
        );

        if (!controller.signal.aborted) {
          setMessages(res.messages.map((m) => ({ ...m, clientStatus: 'persisted' })));
          setHasMoreOlderMessages(res.pagination.total > res.messages.length);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 410) {
          setMessagesError('This conversation has been deleted.');
        } else {
          setMessagesError(err instanceof Error ? err.message : 'Failed to load messages');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingMessages(false);
        }
      }
    },
    [],
  );

  /**
   * Switch active conversation
   */
  const selectConversation = useCallback(
    async (id: string | null) => {
      setActiveConversationId(id);
      setTurnError(null);
      if (id) {
        await fetchMessagesForConversation(id);
      } else {
        setMessages([]);
      }
    },
    [fetchMessagesForConversation],
  );

  /**
   * Load older messages (pagination cursor before earliest message)
   */
  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationId || isLoadingOlderMessages || !hasMoreOlderMessages) return;

    const earliestMessage = messages[0];
    if (!earliestMessage) return;

    setIsLoadingOlderMessages(true);
    try {
      const res = await conversationService.listMessages(activeConversationId, {
        limit: 20,
        order: 'asc',
        beforeMessageId: earliestMessage.id,
      });

      if (res.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOlder = res.messages
            .filter((m) => !existingIds.has(m.id))
            .map((m) => ({ ...m, clientStatus: 'persisted' as const }));
          return [...newOlder, ...prev];
        });
      }

      setHasMoreOlderMessages(res.messages.length >= 20);
    } catch {
      // Pagination error
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [activeConversationId, hasMoreOlderMessages, isLoadingOlderMessages, messages]);

  /**
   * Reconcile message list with backend on failure/timeout
   */
  const reconcileMessages = useCallback(async () => {
    if (!activeConversationId) return;
    try {
      const res = await conversationService.listMessages(activeConversationId, {
        page: 1,
        limit: 30,
        order: 'asc',
      });
      setMessages(res.messages.map((m) => ({ ...m, clientStatus: 'persisted' })));
    } catch {
      // Ignore background reconciliation error
    }
  }, [activeConversationId]);

  /**
   * Submit user turn to Phase 7 Agent Orchestrator
   */
  const submitTurn = useCallback(
    async (content: string, formTaskId?: string) => {
      const trimmed = content.trim();
      if (!trimmed || !activeConversationId || isSubmittingTurn) return;

      setTurnError(null);
      setIsSubmittingTurn(true);

      // 1. Create client optimistic message
      const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversationId: activeConversationId,
        role: 'USER',
        content: trimmed,
        inputMode: 'TEXT',
        language: selectedLanguage,
        createdAt: new Date().toISOString(),
        clientStatus: 'sending',
      };

      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        // 2. Call Phase 7 Agent Orchestrator turn endpoint
        const turnResult = await conversationService.submitTurn(activeConversationId, {
          content: trimmed,
          language: selectedLanguage,
          formTaskId,
        });

        // 3. Update optimistic user message to persisted
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, clientStatus: 'persisted' } : m)),
        );

        // 4. Append assistant response
        const assistantMsg: Message = {
          id: turnResult.assistantMessageId,
          conversationId: activeConversationId,
          role: 'ASSISTANT',
          content: turnResult.response,
          inputMode: 'TEXT',
          language: selectedLanguage,
          createdAt: new Date().toISOString(),
          metadata: {
            intent: turnResult.intent?.primary,
            decision: turnResult.decision?.type,
          },
          clientStatus: 'persisted',
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // 5. Update lastMessageAt in conversation list
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversationId
              ? {
                  ...c,
                  lastMessageAt: assistantMsg.createdAt,
                  _count: { messages: (c._count?.messages ?? 0) + 2 },
                }
              : c,
          ),
        );
      } catch (err) {
        // Mark optimistic message as failed
        const errorMessage =
          err instanceof ApiError
            ? err.message
            : err instanceof NetworkError
              ? 'Network connection lost. Checking if your message was saved...'
              : 'Failed to send turn.';

        setTurnError(errorMessage);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  clientStatus: 'failed',
                  errorText: 'Assistant could not respond. Reconciling with server...',
                }
              : m,
          ),
        );

        // Reconcile with server: createUserMessage commits BEFORE LLM orchestration!
        // Never blindly re-post. Fetch latest messages to confirm if saved.
        await reconcileMessages();
      } finally {
        setIsSubmittingTurn(false);
      }
    },
    [activeConversationId, isSubmittingTurn, reconcileMessages, selectedLanguage],
  );

  /**
   * Correct a previous user message
   */
  const correctUserMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const trimmed = newContent.trim();
      if (!trimmed || !activeConversationId) return;

      const updated = await conversationService.correctMessage(
        activeConversationId,
        messageId,
        trimmed,
      );

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: updated.content,
                revisions: updated.revisions,
              }
            : m,
        ),
      );
    },
    [activeConversationId],
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const value = useMemo<ConversationContextValue>(
    () => ({
      conversations,
      isLoadingList,
      hasMoreConversations,
      isLoadingMoreConversations,
      listError,
      refreshConversations,
      loadMoreConversations,
      createConversation,
      renameConversation,
      archiveConversation,
      deleteConversation,
      activeConversationId,
      activeConversation,
      selectConversation,
      messages,
      isLoadingMessages,
      isLoadingOlderMessages,
      hasMoreOlderMessages,
      loadOlderMessages,
      messagesError,
      isSubmittingTurn,
      turnError,
      selectedLanguage,
      setSelectedLanguage,
      submitTurn,
      correctUserMessage,
      reconcileMessages,
    }),
    [
      conversations,
      isLoadingList,
      hasMoreConversations,
      isLoadingMoreConversations,
      listError,
      refreshConversations,
      loadMoreConversations,
      createConversation,
      renameConversation,
      archiveConversation,
      deleteConversation,
      activeConversationId,
      activeConversation,
      selectConversation,
      messages,
      isLoadingMessages,
      isLoadingOlderMessages,
      hasMoreOlderMessages,
      loadOlderMessages,
      messagesError,
      isSubmittingTurn,
      turnError,
      selectedLanguage,
      submitTurn,
      correctUserMessage,
      reconcileMessages,
    ],
  );

  return (
    <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>
  );
}
