import { MessageSquare, Archive } from 'lucide-react';
import type { Conversation } from '../types/conversation.types';

interface ConversationListItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
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
}: ConversationListItemProps) {
  const isArchived = conversation.status === 'ARCHIVED';
  const messageCount = conversation._count?.messages;
  const timeDisplay = formatRelativeTime(conversation.updatedAt);

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-start gap-2.5 group relative ${
        isActive
          ? 'bg-accent/10 text-accent font-medium'
          : 'text-text-primary hover:bg-page-bg/80'
      }`}
    >
      <div className={`mt-0.5 shrink-0 ${isActive ? 'text-accent' : 'text-text-secondary group-hover:text-text-primary'}`}>
        {isArchived ? (
          <Archive className="w-4 h-4" />
        ) : (
          <MessageSquare className="w-4 h-4" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-medium truncate block">
            {conversation.title || 'Untitled Conversation'}
          </span>
          {timeDisplay && (
            <span className="text-[10px] text-text-placeholder shrink-0">
              {timeDisplay}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-1">
          {isArchived && (
            <span className="text-[10px] px-1.5 py-0.2 bg-warning/10 text-warning rounded font-normal">
              Archived
            </span>
          )}
          {typeof messageCount === 'number' && messageCount > 0 && (
            <span className="text-[10px] text-text-secondary">
              {messageCount} {messageCount === 1 ? 'msg' : 'msgs'}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

