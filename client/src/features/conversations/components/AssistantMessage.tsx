import { Languages, Wrench } from 'lucide-react';
import type { Message } from '../types/conversation.types';

interface AssistantMessageProps {
  message: Message;
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const intent = message.metadata?.intent as string | undefined;

  return (
    <div className="flex flex-col items-start gap-1 w-full max-w-full pr-8">
      <div className="flex items-start gap-2.5 max-w-full">
        {/* Assistant Avatar */}
        <div className="w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
          <Languages className="w-3.5 h-3.5" strokeWidth={1.75} />
        </div>

        {/* Message bubble */}
        <div className="flex flex-col gap-1.5 max-w-full">
          <div className="bg-card text-text-primary border border-divider px-3.5 py-2.5 rounded-2xl rounded-tl-xs text-sm leading-relaxed shadow-xs break-words">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>

          {/* Metadata pills (intent, decision, tool indicators) */}
          {intent && intent !== 'GENERAL_QUESTION' && intent !== 'GREETING' && (
            <div className="flex items-center gap-1.5 pl-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-secondary bg-black/5 px-2 py-0.5 rounded-full">
                <Wrench className="w-2.5 h-2.5" />
                <span>{intent.toLowerCase().replace(/_/g, ' ')}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

