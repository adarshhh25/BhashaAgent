import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { ArrowUp, Globe, Loader2, Mic } from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../types/conversation.types';

interface MessageComposerProps {
  onSend: (content: string) => Promise<void>;
  isSubmitting: boolean;
  selectedLanguage: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  onOpenVoice?: () => void;
  disabled?: boolean;
}

export function MessageComposer({
  onSend,
  isSubmitting,
  selectedLanguage,
  onLanguageChange,
  onOpenVoice,
  disabled = false,
}: MessageComposerProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea based on content
  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [content]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || isSubmitting || disabled) return;

    // Clear content locally before send
    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      await onSend(trimmed);
    } catch {
      // If turn completely failed before server saved, restore text
      setContent(trimmed);
    }
  };

  return (
    <div className="p-3 bg-page-bg border-t border-divider flex flex-col gap-2">
      {/* Composer container */}
      <div className="flex flex-col bg-card border border-input-border rounded-xl p-2.5 shadow-xs focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-all">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask BhashaAgent"
          rows={1}
          disabled={disabled || isSubmitting}
          className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-placeholder focus:outline-none resize-none leading-relaxed max-h-[140px]"
        />

        {/* Toolbar row */}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-divider/60">
          {/* Language selector */}
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Globe className="w-3.5 h-3.5 text-text-placeholder" />
            <select
              value={selectedLanguage}
              onChange={(e) => onLanguageChange(e.target.value as SupportedLanguage)}
              disabled={disabled || isSubmitting}
              className="bg-transparent text-xs font-medium text-text-secondary hover:text-text-primary focus:outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label} ({lang.scriptLabel})
                </option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            {onOpenVoice && (
              <button
                type="button"
                onClick={onOpenVoice}
                disabled={disabled || isSubmitting}
                aria-label="Open voice mode"
                title="Open voice mode"
                className="w-7 h-7 rounded-full bg-surface text-text-secondary hover:text-accent hover:bg-page-bg border border-divider flex items-center justify-center transition-colors disabled:opacity-40 focus:outline-none"
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Send button */}
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!content.trim() || isSubmitting || disabled}
              aria-label="Send message"
              className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:hover:bg-accent focus:outline-none shadow-2xs"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
              )}
            </button>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-center text-text-placeholder">
        Press <strong>Enter</strong> to send • <strong>Shift + Enter</strong> for a new line
      </p>
    </div>
  );
}

