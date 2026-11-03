import { useState, type FormEvent } from 'react';
import { X, Loader2, Plus } from 'lucide-react';
import type { CreateFormTaskRequest } from '../types/form.types';

interface CreateFormTaskModalProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateFormTaskRequest) => Promise<void>;
}

export function CreateFormTaskModal({
  conversationId,
  isOpen,
  onClose,
  onSubmit,
}: CreateFormTaskModalProps) {
  const [webpageUrl, setWebpageUrl] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedUrl = webpageUrl.trim();
    if (!trimmedUrl) {
      setError('Webpage URL is required');
      return;
    }

    try {
      new URL(trimmedUrl);
    } catch {
      setError('Please enter a valid URL (e.g. https://example.com/form)');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        conversationId,
        webpageUrl: trimmedUrl,
        title: title.trim() ? title.trim() : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create form task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        className="bg-card w-full max-w-sm rounded-2xl border border-divider shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="px-4 py-3 border-b border-divider flex items-center justify-between">
          <h3 id="create-task-title" className="text-xs font-semibold text-text-primary">
            New Webpage Form Task
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-text-placeholder hover:text-text-primary hover:bg-page-bg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          {error && (
            <div className="p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="task-url"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Webpage URL *
            </label>
            <input
              id="task-url"
              type="url"
              placeholder="https://example.com/application-form"
              value={webpageUrl}
              onChange={(e) => setWebpageUrl(e.target.value)}
              className="w-full h-8 px-2.5 text-xs bg-input-bg border border-divider rounded-lg text-text-primary focus:outline-none focus:border-accent placeholder:text-text-placeholder"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="task-title"
              className="text-[11px] font-medium text-text-secondary block mb-1"
            >
              Task Title (Optional)
            </label>
            <input
              id="task-title"
              type="text"
              placeholder="e.g. Job Application Form"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-8 px-2.5 text-xs bg-input-bg border border-divider rounded-lg text-text-primary focus:outline-none focus:border-accent placeholder:text-text-placeholder"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-divider">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-all shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Create Task</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

