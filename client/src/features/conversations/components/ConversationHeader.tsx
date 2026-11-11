import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Pencil,
  Archive,
  ArchiveRestore,
  Check,
  X,
  User,
  Bookmark,
} from 'lucide-react';
import type { Conversation } from '../types/conversation.types';

interface ConversationHeaderProps {
  conversation: Conversation | null;
  onToggleSidebar: () => void;
  onRename: (newTitle: string) => Promise<void>;
  onArchive: (archive: boolean) => Promise<void>;
  onDelete?: () => Promise<void>;
  onOpenVoice?: () => void;
  isVoiceActive?: boolean;
}

export function ConversationHeader({
  conversation,
  onToggleSidebar,
  onRename,
  onArchive,
}: ConversationHeaderProps) {
  const navigate = useNavigate();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conversation?.title ?? 'Conversation');

  const isArchived = conversation?.status === 'ARCHIVED';

  const handleSaveTitle = async (e: FormEvent) => {
    e.preventDefault();
    if (!titleDraft.trim()) return;
    await onRename(titleDraft.trim());
    setIsEditingTitle(false);
  };

  return (
    <div className="h-12 border-b border-divider bg-card px-3 flex items-center justify-between shrink-0">
      {/* Left: Sidebar toggle + Title */}
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle conversation history"
          className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-page-bg transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>

        {isEditingTitle ? (
          <form onSubmit={handleSaveTitle} className="flex items-center gap-1 flex-1 max-w-xs">
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              autoFocus
              className="h-7 px-2 bg-input-bg border border-accent rounded text-xs text-text-primary focus:outline-none w-full"
            />
            <button
              type="submit"
              className="p-1 text-success hover:bg-page-bg rounded"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setTitleDraft(conversation?.title ?? 'Conversation');
                setIsEditingTitle(false);
              }}
              className="p-1 text-text-placeholder hover:bg-page-bg rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="text-xs font-semibold text-text-primary truncate">
              {conversation?.title ?? 'BhashaAgent'}
            </h2>
            {conversation && (
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(conversation.title ?? '');
                  setIsEditingTitle(true);
                }}
                title="Rename conversation"
                className="p-1 text-text-placeholder hover:text-text-primary rounded"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {isArchived && (
              <span className="text-[10px] font-medium bg-black/5 text-text-secondary px-1.5 py-0.5 rounded">
                Archived
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {conversation && (
          <button
            type="button"
            onClick={() => void onArchive(!isArchived)}
            title={isArchived ? 'Unarchive conversation' : 'Archive conversation'}
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-page-bg transition-colors"
          >
            {isArchived ? (
              <ArchiveRestore className="w-3.5 h-3.5" />
            ) : (
              <Archive className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {/* Profile Memory link */}
        <button
          type="button"
          onClick={() => navigate('/memory')}
          title="Profile Memory"
          className="p-1.5 rounded text-text-secondary hover:text-accent hover:bg-page-bg transition-colors"
        >
          <Bookmark className="w-3.5 h-3.5" />
        </button>

        {/* Account profile link */}
        <button
          type="button"
          onClick={() => navigate('/account')}
          title="Account Settings"
          className="p-1.5 rounded text-text-secondary hover:text-accent hover:bg-page-bg transition-colors"
        >
          <User className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

