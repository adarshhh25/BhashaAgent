import { useState } from 'react';
import { Pencil, Loader2, AlertCircle } from 'lucide-react';
import type { Message } from '../types/conversation.types';

interface UserMessageProps {
  message: Message;
  onEditClick: (message: Message) => void;
}

export function UserMessage({ message, onEditClick }: UserMessageProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isEdited = Boolean(message.revisions && message.revisions.length > 0);

  return (
    <div
      className="flex flex-col items-end gap-1 w-full max-w-full pl-8"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-2 group">
        {/* Edit button on hover */}
        {message.clientStatus !== 'sending' && (
          <button
            type="button"
            onClick={() => onEditClick(message)}
            title="Edit message"
            className={`p-1 rounded text-text-placeholder hover:text-text-primary hover:bg-black/5 transition-opacity ${
              isHovered ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Message bubble */}
        <div
          className={`px-3.5 py-2.5 rounded-2xl rounded-tr-xs text-sm leading-relaxed break-words max-w-full ${
            message.clientStatus === 'failed'
              ? 'bg-[#FFF2F4] text-error border border-[#FFD0D6]'
              : 'bg-accent text-white shadow-xs'
          }`}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>

      {/* Status & metadata row */}
      <div className="flex items-center gap-1.5 text-[11px] text-text-placeholder pr-1">
        {message.clientStatus === 'sending' && (
          <span className="flex items-center gap-1 text-accent">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Sending...</span>
          </span>
        )}

        {message.clientStatus === 'failed' && (
          <span className="flex items-center gap-1 text-error">
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        )}

        {isEdited && (
          <span className="text-[10px] bg-black/5 px-1.5 py-0.5 rounded text-text-secondary">
            Edited
          </span>
        )}
      </div>
    </div>
  );
}

