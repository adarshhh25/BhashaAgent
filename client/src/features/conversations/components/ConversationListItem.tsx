import { MessageSquare, Archive, Trash2 } from 'lucide-react';
import type { Conversation } from '../types/conversation.types';

interface ConversationListItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDeleteRequest: (conversation: Conversation) => void;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function ConversationListItem({
  conversation,
  isActive,
  onSelect,
  onDeleteRequest,
}: ConversationListItemProps) {
  const isArchived = conversation.status === 'ARCHIVED';
  const messageCount = conversation._count?.messages;
  const timeDisplay = formatRelativeTime(conversation.updatedAt || conversation.createdAt);

  return (
    <div
      onClick={() => onSelect(conversation.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(conversation.id);
        }
      }}
      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-start gap-2.5 group relative cursor-pointer border ${
        isActive
          ? 'bg-[#DCE7DC]/60 border-[#17483A]/30 text-[#102A24] font-medium shadow-2xs'
          : 'border-transparent text-[#252923] hover:bg-[#F7F6F1] hover:border-[#E5E1D8]'
      }`}
    >
      {/* Leading Icon */}
      <div
        className={`mt-0.5 shrink-0 ${
          isActive
            ? 'text-[#102A24]'
            : 'text-[#252923]/60 group-hover:text-[#102A24]'
        }`}
      >
        {isArchived ? (
          <Archive className="w-4 h-4" />
        ) : (
          <MessageSquare className="w-4 h-4" />
        )}
      </div>

      {/* Title & Metadata */}
      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-xs font-medium truncate block leading-tight">
            {conversation.title || 'Untitled Conversation'}
          </span>
          {timeDisplay && (
            <span className="text-[10px] text-[#252923]/50 shrink-0">
              {timeDisplay}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-1">
          {isArchived && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200/60 font-normal">
              Archived
            </span>
          )}
          {typeof messageCount === 'number' && messageCount > 0 && (
            <span className="text-[10px] text-[#252923]/60">
              {messageCount} {messageCount === 1 ? 'msg' : 'msgs'}
            </span>
          )}
        </div>
      </div>

      {/* Trailing Delete Action Button */}
      <button
        type="button"
        aria-label={`Delete conversation ${conversation.title || ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onDeleteRequest(conversation);
        }}
        className="opacity-70 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-1.5 rounded-lg text-[#252923]/50 hover:text-red-600 hover:bg-red-50 focus:opacity-100 focus:outline-none transition-all shrink-0 cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
