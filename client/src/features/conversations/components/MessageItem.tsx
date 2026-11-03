import type { Message } from '../types/conversation.types';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';

interface MessageItemProps {
  message: Message;
  onEditClick: (message: Message) => void;
}

/**
 * Dispatches rendering strictly based on message.role ('USER' | 'ASSISTANT' | 'SYSTEM'),
 * deliberately ignoring inputMode ('TEXT' | 'VOICE') due to backend Phase 7 inputMode metadata quirks.
 */
export function MessageItem({ message, onEditClick }: MessageItemProps) {
  if (message.role === 'USER') {
    return <UserMessage message={message} onEditClick={onEditClick} />;
  }

  return <AssistantMessage message={message} />;
}

