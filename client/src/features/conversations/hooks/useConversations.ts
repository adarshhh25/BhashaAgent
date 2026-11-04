import { useContext } from 'react';
import { ConversationContext } from '../context/conversation-context-def';

export function useConversations() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversations must be used within a ConversationProvider');
  }

  return {
    conversations: context.conversations,
    isLoadingList: context.isLoadingList,
    hasMoreConversations: context.hasMoreConversations,
    isLoadingMoreConversations: context.isLoadingMoreConversations,
    listError: context.listError,
    refreshConversations: context.refreshConversations,
    loadMoreConversations: context.loadMoreConversations,
    createConversation: context.createConversation,
    renameConversation: context.renameConversation,
    archiveConversation: context.archiveConversation,
    deleteConversation: context.deleteConversation,
    activeConversationId: context.activeConversationId,
    activeConversation: context.activeConversation,
    selectConversation: context.selectConversation,
  };
}
