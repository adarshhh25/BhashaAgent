import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, X, MessageSquareDashed, Bookmark, User, FileSpreadsheet } from 'lucide-react';
import type { Conversation } from '../types/conversation.types';
import { ConversationListItem } from './ConversationListItem';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Tab filter
      if (activeTab === 'ACTIVE' && c.status === 'ARCHIVED') return false;
      if (activeTab === 'ARCHIVED' && c.status !== 'ARCHIVED') return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const titleMatch = c.title?.toLowerCase().includes(query);
        return titleMatch;
      }
      return true;
    });
  }, [conversations, activeTab, searchQuery]);

  return (
    <aside className="w-64 sm:w-72 h-full flex flex-col bg-card border-r border-divider select-none">
      {/* Top Header */}
      <div className="p-3 border-b border-divider flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onNew}
          className="flex-1 flex items-center justify-center gap-2 h-9 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-all shadow-sm active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-page-bg rounded-lg transition-colors md:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs bg-input-bg border border-divider rounded-lg text-text-primary placeholder:text-text-placeholder focus:outline-none focus:border-accent transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-placeholder hover:text-text-secondary p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 pb-2 flex gap-1 border-b border-divider">
        {(['ALL', 'ACTIVE', 'ARCHIVED'] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-page-bg text-text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab === 'ALL' ? 'All' : tab === 'ACTIVE' ? 'Active' : 'Archived'}
          </button>
        ))}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {isLoading && conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-text-placeholder text-xs">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2" />
            Loading chats...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-4 text-center text-text-placeholder">
            <MessageSquareDashed className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs font-medium text-text-secondary">No conversations found</p>
            <p className="text-[11px] mt-1 text-text-placeholder">
              {searchQuery ? 'Try a different search query' : 'Start a new conversation to get started'}
            </p>
          </div>
        ) : (
          filteredConversations.map((item) => (
            <ConversationListItem
              key={item.id}
              conversation={item}
              isActive={item.id === activeId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      {/* Bottom Quick Links */}
      <div className="p-2 border-t border-divider flex items-center justify-between text-xs text-text-secondary bg-card shrink-0 gap-1">
        <button
          type="button"
          onClick={() => navigate('/forms')}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:text-text-primary hover:bg-page-bg transition-colors flex-1 min-w-0"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="truncate">Forms</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/memory')}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:text-text-primary hover:bg-page-bg transition-colors flex-1 min-w-0"
        >
          <Bookmark className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="truncate">Memory</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:text-text-primary hover:bg-page-bg transition-colors shrink-0"
          title="Account Settings"
        >
          <User className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
