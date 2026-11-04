import { createContext } from 'react';
import type {
  Conversation,
  Message,
  SupportedLanguage,
} from '../types/conversation.types';

export interface ConversationContextValue {
  // Conversation List
  conversations: Conversation[];
  isLoadingList: boolean;
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  listError: string | null;
  refreshConversations: () => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  renameConversation: (id: string, newTitle: string) => Promise<void>;
  archiveConversation: (id: string, archive: boolean) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;

  // Active Conversation & Message History
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  selectConversation: (id: string | null) => Promise<void>;
  messages: Message[];
  isLoadingMessages: boolean;
  isLoadingOlderMessages: boolean;
  hasMoreOlderMessages: boolean;
  loadOlderMessages: () => Promise<void>;
  messagesError: string | null;

  // Turn Composition & Agent
  isSubmittingTurn: boolean;
  turnError: string | null;
  selectedLanguage: SupportedLanguage;
  setSelectedLanguage: (lang: SupportedLanguage) => void;
  submitTurn: (content: string, formTaskId?: string) => Promise<void>;
  correctUserMessage: (messageId: string, newContent: string) => Promise<void>;
  reconcileMessages: () => Promise<void>;
}

export const ConversationContext = createContext<ConversationContextValue | null>(null);
