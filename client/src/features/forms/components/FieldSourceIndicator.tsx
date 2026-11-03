import { Bookmark, MessageSquare, User, Sparkles, Globe } from 'lucide-react';
import type { FieldValueSource, MappingSource } from '../types/form.types';

interface FieldSourceIndicatorProps {
  source?: FieldValueSource | MappingSource;
}

export function FieldSourceIndicator({ source }: FieldSourceIndicatorProps) {
  if (!source) return null;

  switch (source) {
    case 'approved_profile':
    case 'APPROVED_PROFILE_MEMORY':
    case 'PROFILE_MEMORY':
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded"
          title="Sourced from Approved Profile Memory"
        >
          <Bookmark className="w-3 h-3" />
          <span>Profile Memory</span>
        </span>
      );

    case 'conversation_answer':
    case 'CONVERSATION':
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded"
          title="Sourced from Conversation"
        >
          <MessageSquare className="w-3 h-3" />
          <span>Conversation</span>
        </span>
      );

    case 'USER_CORRECTED':
    case 'user_explicit_instruction':
    case 'USER_PROVIDED':
    case 'USER_INPUT':
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded"
          title="Manually entered or corrected by user"
        >
          <User className="w-3 h-3" />
          <span>User Value</span>
        </span>
      );

    case 'AI_SUGGESTION':
    case 'AGENT_PROPOSED':
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded"
          title="Proposed by AI Agent"
        >
          <Sparkles className="w-3 h-3" />
          <span>AI Suggested</span>
        </span>
      );

    case 'existing_task_value':
    case 'SYSTEM_DEFAULT':
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium text-text-secondary bg-page-bg px-1.5 py-0.5 rounded"
          title="Default webpage value"
        >
          <Globe className="w-3 h-3" />
          <span>Webpage Value</span>
        </span>
      );

    default:
      return (
        <span className="text-[10px] text-text-secondary bg-page-bg px-1.5 py-0.5 rounded">
          {String(source).replace(/_/g, ' ')}
        </span>
      );
  }
}

