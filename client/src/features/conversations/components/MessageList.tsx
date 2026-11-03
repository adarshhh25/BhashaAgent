import { useEffect, useRef } from 'react';
import { Loader2, ArrowUpCircle } from 'lucide-react';
import type { Message } from '../types/conversation.types';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: Message[];
  isLoadingOlder: boolean;
  hasMoreOlder: boolean;
  onLoadOlder: () => void;
  onEditClick: (message: Message) => void;
  isSubmittingTurn: boolean;
}

export function MessageList({
  messages,
  isLoadingOlder,
  hasMoreOlder,
  onLoadOlder,
  onEditClick,
  isSubmittingTurn,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSubmittingTurn]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4"
    >
      {/* Pagination trigger for older messages */}
      {hasMoreOlder && (
        <div className="flex justify-center pt-1 pb-2">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={isLoadingOlder}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-card border border-divider text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-page-bg transition-colors disabled:opacity-50 shadow-2xs"
          >
            {isLoadingOlder ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
            ) : (
              <ArrowUpCircle className="w-3.5 h-3.5" />
            )}
            <span>Load older messages</span>
          </button>
        </div>
      )}

      {/* Messages */}
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          onEditClick={onEditClick}
        />
      ))}

      {/* Submitting indicator */}
      {isSubmittingTurn && (
        <div className="flex items-center gap-2 text-text-secondary text-xs pl-2 py-1">
          <span className="flex gap-1 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          </span>
          <span className="text-[11px] text-text-placeholder">Thinking...</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

