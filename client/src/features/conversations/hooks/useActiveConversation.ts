import { useContext } from 'react';
import { ConversationContext } from '../context/conversation-context-def';

export function useActiveConversation() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useActiveConversation must be used within a ConversationProvider');
  }

  return {
    activeConversationId: context.activeConversationId,
    activeConversation: context.activeConversation,
    messages: context.messages,
    isLoadingMessages: context.isLoadingMessages,
    isLoadingOlderMessages: context.isLoadingOlderMessages,
    hasMoreOlderMessages: context.hasMoreOlderMessages,
    loadOlderMessages: context.loadOlderMessages,
    messagesError: context.messagesError,
    isSubmittingTurn: context.isSubmittingTurn,
    turnError: context.turnError,
    selectedLanguage: context.selectedLanguage,
    setSelectedLanguage: context.setSelectedLanguage,
    submitTurn: context.submitTurn,
    correctUserMessage: context.correctUserMessage,
    reconcileMessages: context.reconcileMessages,
  };
}

