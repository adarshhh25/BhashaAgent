import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useConversations } from '../hooks/useConversations';
import { useActiveConversation } from '../hooks/useActiveConversation';
import { useActiveBrowserForm } from '../../browser/hooks/useActiveBrowserForm';
import { ConversationLayout } from '../components/ConversationLayout';
import { ConversationSidebar } from '../components/ConversationSidebar';
import { ConversationHeader } from '../components/ConversationHeader';
import { MessageList } from '../components/MessageList';
import { MessageComposer } from '../components/MessageComposer';
import { MessageCorrectionModal } from '../components/MessageCorrectionModal';
import { VoiceInterface } from '../../voice/components/VoiceInterface';
import { BhashaLogo } from '../../../components/common/BhashaLogo';
import type { Message } from '../types/conversation.types';

export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  const {
    conversations,
    isLoadingList,
    createConversation,
    renameConversation,
    archiveConversation,
    activeConversationId,
    selectConversation,
  } = useConversations();

  const {
    activeConversation,
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
  } = useActiveConversation();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);

  // Active Browser Form context sync
  const currentConversationId = activeConversationId || conversationId;
  const { activeFormTask, activeFormTaskId, fieldCount, rescan } =
    useActiveBrowserForm(currentConversationId);

  // Sync route param with active conversation state
  useEffect(() => {
    if (conversationId && conversationId !== activeConversationId) {
      void selectConversation(conversationId);
    }
  }, [conversationId, activeConversationId, selectConversation]);

  // Handle selecting a conversation
  const handleSelectConversation = useCallback(
    (id: string) => {
      navigate(`/conversations/${id}`);
      void selectConversation(id);
      setIsSidebarOpen(false);
    },
    [navigate, selectConversation],
  );

  // Handle starting a new conversation
  const handleNewConversation = useCallback(async () => {
    try {
      const newConv = await createConversation();
      navigate(`/conversations/${newConv.id}`);
      await selectConversation(newConv.id);
      setIsSidebarOpen(false);
    } catch {
      // Creation error
    }
  }, [createConversation, navigate, selectConversation]);

  // Handle sending a turn
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!activeConversationId) {
        // Auto-create conversation if none is active
        const titleSnippet = content.trim().slice(0, 32);
        const newConv = await createConversation(titleSnippet);
        navigate(`/conversations/${newConv.id}`);
        await selectConversation(newConv.id);
      }
      await submitTurn(content, activeFormTaskId);
    },
    [activeConversationId, activeFormTaskId, createConversation, navigate, selectConversation, submitTurn],
  );

  // Handle opening voice mode from chat composer
  const handleOpenVoice = useCallback(async () => {
    if (!activeConversationId) {
      try {
        const newConv = await createConversation('Voice Conversation');
        navigate(`/conversations/${newConv.id}`);
        await selectConversation(newConv.id);
      } catch {
        // Failed to create conversation
      }
    }
    setIsVoiceModeOpen(true);
  }, [activeConversationId, createConversation, navigate, selectConversation]);

  return (
    <ConversationLayout
      isSidebarOpen={isSidebarOpen}
      onCloseSidebar={() => setIsSidebarOpen(false)}
      sidebar={
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversationId}
          isLoading={isLoadingList}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onClose={() => setIsSidebarOpen(false)}
        />
      }
    >
      {/* Top Header */}
      <ConversationHeader
        conversation={activeConversation}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onRename={async (title) => {
          if (activeConversationId) await renameConversation(activeConversationId, title);
        }}
        onArchive={async (archive) => {
          if (activeConversationId) await archiveConversation(activeConversationId, archive);
        }}
      />

      {/* Main Content: Voice Mode or Message Stream */}
      {isVoiceModeOpen ? (
        <VoiceInterface
          conversationId={activeConversationId}
          conversationTitle={activeConversation?.title}
          formTaskId={activeFormTaskId}
          activeFormTitle={activeFormTask?.title || activeFormTask?.webpageTitle}
          fieldCount={fieldCount}
          conversationStatus={activeConversation?.status}
          selectedLanguage={selectedLanguage}
          onClose={() => setIsVoiceModeOpen(false)}
          onSendTranscriptMessage={async () => {
            // Reconcile messages from backend without duplicate message creation
            await reconcileMessages();
            await rescan();
          }}
        />
      ) : (
        <div className="flex-1 flex flex-col min-h-0 relative">
          {isLoadingMessages ? (
            <div className="flex-1 flex flex-col items-center justify-center text-text-placeholder text-xs">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2" />
              <span>Loading messages...</span>
            </div>
          ) : messagesError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <AlertCircle className="w-8 h-8 text-error mb-2 opacity-80" />
              <p className="text-xs text-text-primary font-medium mb-1">{messagesError}</p>
              <button
                type="button"
                onClick={() => {
                  if (activeConversationId) void selectConversation(activeConversationId);
                }}
                className="mt-2 text-xs text-accent hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            </div>
          ) : !activeConversationId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-text-secondary">
              <BhashaLogo className="w-12 h-12 rounded-2xl mb-3 shadow-xs" />
              <h3 className="text-sm font-medium text-text-primary mb-1">No conversation selected</h3>
              <p className="text-xs text-text-secondary max-w-xs mb-4">
                Start a new conversation in English, Hindi, Marathi, or Hinglish, or pick one from history.
              </p>
              <button
                type="button"
                onClick={() => void handleNewConversation()}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors shadow-2xs"
              >
                Start New Chat
              </button>
            </div>
          ) : (
            <MessageList
              messages={messages}
              isLoadingOlder={isLoadingOlderMessages}
              hasMoreOlder={hasMoreOlderMessages}
              onLoadOlder={loadOlderMessages}
              onEditClick={(msg: Message) => setEditingMessage(msg)}
              isSubmittingTurn={isSubmittingTurn}
            />
          )}

          {/* Turn Failure Notification */}
          {turnError && (
            <div className="px-4 py-2 bg-error/10 border-t border-error/20 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-3.5 h-3.5 text-error shrink-0" />
                <span className="text-xs text-error truncate">{turnError}</span>
              </div>
              <button
                type="button"
                onClick={() => void reconcileMessages()}
                className="text-xs text-error font-medium hover:underline shrink-0"
              >
                Reconcile
              </button>
            </div>
          )}

          {/* Bottom Message Composer */}
          <MessageComposer
            onSend={handleSendMessage}
            disabled={isSubmittingTurn || activeConversation?.status === 'DELETED'}
            isSubmitting={isSubmittingTurn}
            selectedLanguage={selectedLanguage}
            onLanguageChange={setSelectedLanguage}
            onOpenVoice={handleOpenVoice}
            isVoiceActive={isVoiceModeOpen}
          />
        </div>
      )}

      {/* Inline User Message Correction Dialog */}
      {editingMessage && (
        <MessageCorrectionModal
          message={editingMessage}
          isOpen={Boolean(editingMessage)}
          onClose={() => setEditingMessage(null)}
          onSave={async (messageId: string, newContent: string) => {
            await correctUserMessage(messageId, newContent);
            setEditingMessage(null);
          }}
        />
      )}
    </ConversationLayout>
  );
}

export default ConversationPage;
