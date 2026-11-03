import { useState, type FormEvent } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import type { Message } from '../types/conversation.types';

interface MessageCorrectionModalProps {
  message: Message;
  isOpen: boolean;
  onClose: () => void;
  onSave: (messageId: string, newContent: string) => Promise<void>;
}

export function MessageCorrectionModal({
  message,
  isOpen,
  onClose,
  onSave,
}: MessageCorrectionModalProps) {
  const [content, setContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setError('Message content cannot be empty');
      return;
    }

    if (trimmed === message.content) {
      onClose();
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(message.id, trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update message');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
    >
      <div className="bg-card w-full max-w-sm rounded-xl border border-divider shadow-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
          <h3 className="text-xs font-semibold text-text-primary">Edit Message</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1 rounded text-text-placeholder hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          {error && (
            <p className="text-xs text-error bg-[#FFF2F4] border border-[#FFD0D6] p-2 rounded">
              {error}
            </p>
          )}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSaving}
            rows={4}
            className="w-full p-2.5 bg-input-bg border border-input-border rounded-md text-xs text-text-primary placeholder:text-text-placeholder focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            placeholder="Type your corrected message..."
          />

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3 py-1.5 rounded border border-divider text-xs text-text-secondary hover:text-text-primary hover:bg-page-bg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !content.trim()}
              className="px-3 py-1.5 rounded bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Save</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

