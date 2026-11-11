import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { ArrowUp, Loader2, Mic } from 'lucide-react';
import type { SupportedLanguage } from '../types/conversation.types';

interface MessageComposerProps {
  onSend: (content: string) => Promise<void>;
  isSubmitting: boolean;
  selectedLanguage?: SupportedLanguage;
  onLanguageChange?: (lang: SupportedLanguage) => void;
  onOpenVoice?: () => void;
  isVoiceActive?: boolean;
  disabled?: boolean;
}

const MIN_TEXTAREA_HEIGHT = 24; // Single line baseline height
const MAX_TEXTAREA_HEIGHT = 140; // Max height before vertical scrolling

export function MessageComposer({
  onSend,
  isSubmitting,
  onOpenVoice,
  isVoiceActive = false,
  disabled = false,
}: MessageComposerProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea to occupy the full left area and grow smoothly
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;

    // Reset height to base to accurately measure scrollHeight (handles deletions and pastes)
    el.style.height = `${MIN_TEXTAREA_HEIGHT}px`;

    if (!el.value) {
      el.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
      el.style.overflowY = 'hidden';
      return;
    }

    const scrollH = el.scrollHeight;
    if (scrollH > MAX_TEXTAREA_HEIGHT) {
      el.style.height = `${MAX_TEXTAREA_HEIGHT}px`;
      el.style.overflowY = 'auto';
    } else {
      el.style.height = `${Math.max(scrollH, MIN_TEXTAREA_HEIGHT)}px`;
      el.style.overflowY = 'hidden';
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

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

    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
      textareaRef.current.style.overflowY = 'hidden';
    }

    try {
      await onSend(trimmed);
    } catch {
      setContent(trimmed);
    }
  };

  return (
    <div className="p-2.5 sm:p-3 bg-page-bg border-t border-divider">
      {/* 
        ChatGPT-Style Chat Composer:
        - Flexible layout: left-side flexible textarea + right-side fixed send button.
        - Single-line: compact 46px height with text and button cleanly aligned.
        - Multiline: textarea grows and utilizes the entire available left-side area vertically & horizontally.
        - Send button stays docked at bottom-right (self-end) with safe spacing so text never overlaps.
      */}
      <div className="flex items-end gap-2.5 bg-card border border-accent rounded-xl px-3 py-2 shadow-2xs focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-all min-h-[46px]">
        {/* Left Side: Flexible Textarea Area */}
        <div className="flex-1 min-w-0 flex items-center self-stretch">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask BhashaAgent"
            rows={1}
            disabled={disabled || isSubmitting}
            style={{ outline: 'none' }}
            className="w-full bg-transparent text-xs sm:text-[13px] text-text-primary placeholder:text-text-placeholder border-0 border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none resize-none leading-relaxed p-0 m-0 block"
          />
        </div>

        {/* Right Side: Microphone + Send Arrow pinned to bottom-right */}
        <div className="shrink-0 self-end flex items-center gap-1.5 pb-0.5">
          {onOpenVoice && (
            <button
              type="button"
              onClick={onOpenVoice}
              disabled={disabled || isSubmitting}
              aria-label={isVoiceActive ? 'Close Voice Mode' : 'Start Voice Mode'}
              title={isVoiceActive ? 'Close Voice Mode' : 'Voice Mode'}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent cursor-pointer ${
                isVoiceActive
                  ? 'bg-accent text-white shadow-2xs'
                  : 'text-text-primary hover:text-accent hover:bg-accent/10 active:bg-accent/20 active:scale-95'
              } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
            >
              <Mic className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!content.trim() || isSubmitting || disabled}
            aria-label="Send message"
            title="Send message"
            className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:hover:bg-accent focus:outline-none shadow-2xs shrink-0 cursor-pointer"
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
  );
}
