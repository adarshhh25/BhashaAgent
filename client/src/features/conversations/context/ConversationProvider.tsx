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
  // Per-turn generation ID for cancellation propagation to content script
  const chatGenerationIdRef = useRef(0);

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
      // Cancel any in-flight form fills for the previous conversation
      chatGenerationIdRef.current++;
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          const tab = tabs[0];
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_FILL_EXECUTION' }).catch(() => {});
          }
        }).catch(() => {});
      }
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

        // 3. Update optimistic user message to persisted with detected language
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, clientStatus: 'persisted', language: (turnResult as any).language?.detected || m.language } : m)),
        );

        // 4. Append assistant response
        const assistantMsg: Message = {
          id: turnResult.assistantMessageId,
          conversationId: activeConversationId,
          role: 'ASSISTANT',
          content: turnResult.response,
          inputMode: 'TEXT',
          language: (turnResult as any).language?.responseLanguage || selectedLanguage,
          createdAt: new Date().toISOString(),
          metadata: {
            intent: turnResult.intent?.primary,
            decision: turnResult.decision?.type,
          },
          clientStatus: 'persisted',
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // Direct in-page autofill execution without mandatory approval modal
        if (turnResult.formActions && turnResult.formActions.length > 0) {
          if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
            void (async () => {
              let tab: chrome.tabs.Tab | undefined;
              try {
                const lastTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                tab = lastTabs.find((t) => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
              } catch {}
              if (!tab) {
                try {
                  const currTabs = await chrome.tabs.query({ active: true, currentWindow: true });
                  tab = currTabs.find((t) => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
                } catch {}
              }
              if (!tab) {
                try {
                  const allTabs = await chrome.tabs.query({ active: true });
                  tab = allTabs.find((t) => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
                } catch {}
              }

              if (tab?.id && tab.url) {
                const currentGenId = Date.now();
                chatGenerationIdRef.current = currentGenId;
                const actions = turnResult.formActions!.map((fa, index) => ({
                  actionId: `chat-fill-${currentGenId}-${index}`,
                  fieldId: fa.fieldIdentifier || fa.fieldId || '',
                  fieldIdentifier: fa.fieldIdentifier || fa.fieldId || '',
                  action: fa.actionType,
                  actionType: fa.actionType,
                  value: fa.value,
                  expectedFieldType: '',
                  originalInstruction: (fa as any).originalInstruction || trimmed,
                  requestedTarget: (fa as any).requestedTarget || fa.label || fa.fieldIdentifier,
                  generationId: currentGenId,
                }));

                let isSuccess = false;

                // Priority 1: Forward through background script (ensures content script injection & connection readiness)
                if (chrome.runtime?.sendMessage) {
                  try {
                    const forwardResp: any = await chrome.runtime.sendMessage({
                      type: 'FORWARD_TO_CONTENT',
                      targetTabId: tab.id,
                      payload: {
                        type: 'EXECUTE_FILL_INSTRUCTIONS',
                        expectedUrl: tab.url,
                        targetTabId: tab.id,
                        payload: { actions, generationId: currentGenId },
                      },
                    });
                    if (forwardResp?.success && forwardResp.data?.overallStatus !== 'FAILED') {
                      isSuccess = true;
                    }
                  } catch {
                    // Forward message failed, proceed to direct tab messaging
                  }
                }

                // Priority 2: Direct tab sendMessage
                if (!isSuccess) {
                  try {
                    const execResp: any = await chrome.tabs.sendMessage(tab.id, {
                      type: 'EXECUTE_FILL_INSTRUCTIONS',
                      payload: { actions, generationId: currentGenId },
                    });
                    if (execResp && execResp.success !== false && execResp.data?.overallStatus !== 'FAILED') {
                      isSuccess = true;
                    }
                  } catch {
                    // Message delivery failed, will attempt direct DOM execution below
                  }
                }

                // If content script messaging was unsuccessful, execute DOM mutation directly via scripting API
                if (!isSuccess && chrome.scripting?.executeScript) {
                  try {
                    const execResults = await chrome.scripting.executeScript({
                      target: { tabId: tab.id },
                      func: (actionList: typeof actions) => {
                        let successCount = 0;
                        for (const act of actionList) {
                          const targetId = act.fieldIdentifier || act.fieldId || '';
                          const actType = (act.action || act.actionType || 'SET_VALUE').toUpperCase();
                          const val = act.value;

                          let el: HTMLElement | null = null;
                          if (targetId) {
                            el = document.getElementById(targetId) ||
                              document.querySelector(`[name="${targetId}"]`) ||
                              document.querySelector(`[data-field-id="${targetId}"]`) ||
                              document.querySelector(`[data-testid="${targetId}"]`);
                          }

                          if (!el && targetId) {
                            const lower = targetId.toLowerCase().replace(/[:\s]+$/, '').trim();
                            const all = Array.from(document.querySelectorAll<HTMLElement>('input, select, textarea'));
                            for (const c of all) {
                              const cName = (c.getAttribute('name') || (c as any).name || '').toLowerCase();
                              if (cName === lower) { el = c; break; }
                              const cId = (c.id || '').toLowerCase();
                              if (cId === lower) { el = c; break; }
                              const lbl = c.closest('label')?.textContent?.trim().toLowerCase();
                              if (lbl && (lbl === lower || lbl.startsWith(lower) || lower.startsWith(lbl))) { el = c; break; }
                            }
                          }

                          if (!el) continue;
                          if (el.tagName.toLowerCase() === 'input' && (el as HTMLInputElement).type?.toLowerCase() === 'file') continue;

                          if (typeof el.focus === 'function') el.focus();
                          const tag = el.tagName.toLowerCase();
                          const inputType = ('type' in el && typeof (el as any).type === 'string') ? (el as any).type.toLowerCase() : tag;

                          if (inputType === 'checkbox') {
                            const chk = el as HTMLInputElement;
                            const targetVal = String(val ?? '').trim().toLowerCase();
                            if (chk.name && (Array.isArray(val) || (targetVal !== 'true' && targetVal !== 'false' && targetVal !== '1' && targetVal !== '0' && targetVal !== 'on' && targetVal !== ''))) {
                              const desiredValues = Array.isArray(val)
                                ? val.map((v) => String(v).trim().toLowerCase())
                                : targetVal.split(/[,\s]+/).map((v) => v.trim().toLowerCase());

                              const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${chk.name}"]`));
                              for (const box of group) {
                                const boxVal = box.value.trim().toLowerCase();
                                const boxLabel = (box.closest('label')?.textContent || '').trim().toLowerCase();
                                const shouldBeChecked = desiredValues.some((dv) => dv === boxVal || dv === boxLabel || boxLabel.includes(dv));
                                if (shouldBeChecked) {
                                  if (!box.checked) {
                                    if (typeof box.click === 'function') box.click();
                                    if (!box.checked) box.checked = true;
                                  }
                                  box.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                                  box.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                                }
                              }
                              successCount++;
                            } else {
                              const desired = actType === 'CHECK' || (actType === 'SET_VALUE' && (val === true || val === 'true' || val === 1 || String(val).toLowerCase() === 'on'));
                              if (chk.checked !== desired) {
                                if (typeof chk.click === 'function') chk.click();
                                if (chk.checked !== desired) chk.checked = desired;
                              }
                              chk.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                              chk.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                              if (chk.checked === desired) successCount++;
                            }
                          } else if (inputType === 'radio') {
                            const rad = el as HTMLInputElement;
                            let targetRadio = rad;
                            const targetVal = String(val ?? '').trim().toLowerCase();
                            if (rad.name && targetVal) {
                              const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${rad.name}"]`));
                              const found = group.find((r) => r.value.trim().toLowerCase() === targetVal || r.closest('label')?.textContent?.trim().toLowerCase() === targetVal);
                              if (found) targetRadio = found;
                            }
                            if (typeof targetRadio.focus === 'function') targetRadio.focus();
                            if (!targetRadio.checked) {
                              if (typeof targetRadio.click === 'function') targetRadio.click();
                              if (!targetRadio.checked) targetRadio.checked = true;
                            }
                            targetRadio.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                            targetRadio.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                            if (targetRadio.checked) successCount++;
                          } else if (tag === 'select') {
                            const sel = el as HTMLSelectElement;
                            const strVal = String(val ?? '').trim().toLowerCase();
                            const opt = Array.from(sel.options).find((o) => o.value.toLowerCase() === strVal || o.text.trim().toLowerCase() === strVal);
                            if (opt) {
                              sel.value = opt.value;
                              sel.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                              sel.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                              successCount++;
                            }
                          } else {
                            const strVal = String(val ?? '');
                            const proto = tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                            if (desc?.set) {
                              desc.set.call(el, strVal);
                            } else {
                              (el as HTMLInputElement).value = strVal;
                            }
                            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                            el.dispatchEvent(new Event('blur', { bubbles: true }));
                            if ((el as HTMLInputElement).value === strVal) successCount++;
                          }
                        }
                        return { successCount, total: actionList.length };
                      },
                      args: [actions],
                    });
                    if (execResults?.[0]?.result && execResults[0].result.successCount > 0) {
                      isSuccess = true;
                    }
                  } catch (directErr) {
                    console.warn('[ConversationProvider] Direct DOM scripting execution failed:', directErr);
                  }
                }

                // Honest execution check: if DOM execution or readback failed, update message
                if (!isSuccess) {
                  const targetLabel = turnResult.formActions![0]?.label || turnResult.formActions![0]?.fieldIdentifier || 'field';
                  let failureNotice = `I prepared the update for ${targetLabel}, but could not update the webpage input. Please try again.`;
                  const lang = turnResult.language?.responseLanguage || 'en';
                  if (lang === 'hi') {
                    failureNotice = `मैंने ${targetLabel} का नया मान तैयार किया है, लेकिन फ़ॉर्म में बदलाव नहीं हो पाया। कृपया दोबारा प्रयास करें।`;
                  } else if (lang === 'mr') {
                    failureNotice = `मी ${targetLabel} साठी माहिती तयार केली आहे, पण फॉर्ममध्ये बदल होऊ शकला नाही. कृपया पुन्हा प्रयत्न करा.`;
                  } else if (lang === 'hinglish') {
                    failureNotice = `Maine ${targetLabel} ka update taiyaar kiya tha, lekin form mein badlaav nahi ho paaya. Aap dobara koshish kar sakte hain.`;
                  }

                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id ? { ...m, content: failureNotice } : m,
                    ),
                  );
                }
              }
            })();
          }
        }

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
