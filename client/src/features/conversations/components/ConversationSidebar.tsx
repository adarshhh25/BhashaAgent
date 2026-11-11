import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  X,
  MessageSquareDashed,
  LogOut,
  Loader2,
} from 'lucide-react';
import type { Conversation } from '../types/conversation.types';
import { ConversationListItem } from './ConversationListItem';
import { DeleteConversationModal } from './DeleteConversationModal';
import { useConversations } from '../hooks/useConversations';
import { useAuth } from '../../auth/hooks/useAuth';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose?: () => void;
}

type FilterTab = 'ALL' | 'ACTIVE' | 'ARCHIVED';

export function ConversationSidebar({
  conversations,
  activeId,
  isLoading,
  onSelect,
  onNew,
  onClose,
}: ConversationSidebarProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const {
    deleteConversation,
    loadMoreConversations,
    hasMoreConversations,
    isLoadingMoreConversations,
  } = useConversations();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search query input (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Client-side filter for active tab and search query
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Exclude soft-deleted items
      if (c.status === 'DELETED') return false;

      // Tab filter
      if (activeTab === 'ACTIVE' && c.status === 'ARCHIVED') return false;
      if (activeTab === 'ARCHIVED' && c.status !== 'ARCHIVED') return false;

      // Search filter
      if (debouncedSearchQuery.trim()) {
        const query = debouncedSearchQuery.toLowerCase();
        const titleMatch = c.title?.toLowerCase().includes(query);
        return Boolean(titleMatch);
      }
      return true;
    });
  }, [conversations, activeTab, debouncedSearchQuery]);

  // Prevent duplicate clicks on "New Chat" button
  const handleNewChat = useCallback(async () => {
    if (isCreatingNew) return;
    setIsCreatingNew(true);
    try {
      await onNew();
      if (onClose) onClose();
    } finally {
      setIsCreatingNew(false);
    }
  }, [isCreatingNew, onNew, onClose]);

  // Delete flow
  const handleConfirmDelete = useCallback(async () => {
    if (!conversationToDelete) return;
    setIsDeleting(true);
    try {
      const deletedId = conversationToDelete.id;
      await deleteConversation(deletedId);
      setConversationToDelete(null);
      if (deletedId === activeId) {
        navigate('/');
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [conversationToDelete, deleteConversation, activeId, navigate]);

  // Sign out flow
  const handleSignOut = useCallback(async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  }, [logout, navigate]);

  // Infinite scroll intersection observer sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && hasMoreConversations && !isLoadingMoreConversations) {
          void loadMoreConversations();
        }
      },
      { rootMargin: '100px' },
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMoreConversations, isLoadingMoreConversations, loadMoreConversations]);

  return (
    <aside className="w-64 sm:w-72 h-full flex flex-col bg-white border-r border-[#E5E1D8] select-none text-[#252923]">
      {/* 1. TOP HEADER: "New Chat" Action */}
      <div className="p-3 border-b border-[#E5E1D8] flex items-center justify-between gap-2 shrink-0 bg-white">
        <button
          type="button"
          onClick={() => void handleNewChat()}
          disabled={isCreatingNew}
          className="flex-1 flex items-center justify-center gap-2 h-9 px-3.5 rounded-xl bg-[#102A24] hover:bg-[#17483A] text-white text-xs font-semibold transition-all shadow-xs active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isCreatingNew ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Plus className="w-4 h-4 text-white" />
          )}
          <span>{isCreatingNew ? 'Creating...' : 'New Chat'}</span>
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="p-2 text-[#252923]/60 hover:text-[#102A24] hover:bg-[#F7F6F1] rounded-lg transition-colors md:hidden cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. SEARCH INPUT (Debounced) */}
      <div className="px-3 pt-3 pb-2 shrink-0 bg-white">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#252923]/50 pointer-events-none" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-7 text-xs bg-[#F7F6F1] border border-[#E5E1D8] rounded-lg text-[#252923] placeholder:text-[#252923]/40 focus:outline-none focus:border-[#17483A] focus:bg-white transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#252923]/40 hover:text-[#252923] p-0.5 rounded cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 3. FILTER TABS (All / Active / Archived) */}
      <div className="px-3 pb-2 flex gap-1 border-b border-[#E5E1D8] shrink-0 bg-white">
        {(['ALL', 'ACTIVE', 'ARCHIVED'] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-colors cursor-pointer ${
              activeTab === tab
                ? 'bg-[#DCE7DC] text-[#102A24] font-semibold shadow-2xs'
                : 'text-[#252923]/70 hover:text-[#102A24] hover:bg-[#F7F6F1]'
            }`}
          >
            {tab === 'ALL' ? 'All' : tab === 'ACTIVE' ? 'Active' : 'Archived'}
          </button>
        ))}
      </div>

      {/* 4. CONVERSATION LIST (Middle scrollable area with infinite scroll) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
        {isLoading && conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-44 text-[#252923]/50 text-xs">
            <Loader2 className="w-5 h-5 text-[#17483A] animate-spin mb-2" />
            <span>Loading conversations...</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-4 text-center text-[#252923]/60">
            <MessageSquareDashed className="w-8 h-8 mb-2 opacity-40 text-[#17483A]" />
            <p className="text-xs font-medium text-[#102A24]">No conversations found</p>
            <p className="text-[11px] mt-1 text-[#252923]/50">
              {debouncedSearchQuery
                ? 'No chats match your search query'
                : 'Start a new chat to begin exploring'}
            </p>
          </div>
        ) : (
          <>
            {filteredConversations.map((item) => (
              <ConversationListItem
                key={item.id}
                conversation={item}
                isActive={item.id === activeId}
                onSelect={(id) => {
                  onSelect(id);
                  if (onClose) onClose();
                }}
                onDeleteRequest={(conv) => setConversationToDelete(conv)}
              />
            ))}

            {/* Bottom Sentinel for Infinite Scroll */}
            <div ref={sentinelRef} className="h-2 w-full" />

            {/* Loading Indicator for Infinite Scroll */}
            {isLoadingMoreConversations && (
              <div className="flex items-center justify-center py-2.5 text-[#252923]/50 text-[11px] gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#17483A]" />
                <span>Loading more...</span>
              </div>
            )}

          </>
        )}
      </div>

      {/* 5. BOTTOM NAVIGATION FOOTER: Full-width Sign Out */}
      <div className="p-2 border-t border-[#E5E1D8] bg-white shrink-0 mt-auto">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-[#252923]/80 hover:text-red-600 hover:bg-red-50/80 transition-colors cursor-pointer"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* 6. DELETE CONFIRMATION DIALOG */}
      <DeleteConversationModal
        isOpen={Boolean(conversationToDelete)}
        conversationTitle={conversationToDelete?.title}
        isDeleting={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConversationToDelete(null)}
      />
    </aside>
  );
}
