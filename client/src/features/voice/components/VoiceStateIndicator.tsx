import type { VoicePresentationState } from '../types/voice.types';
import type { SupportedLanguage } from '../../conversations/types/conversation.types';
import { getLocalizedStateLabel } from '../utils/voice-translations';

interface VoiceStateIndicatorProps {
  state: VoicePresentationState;
  language?: SupportedLanguage;
  className?: string;
}

export function VoiceStateIndicator({
  state,
  language = 'en',
  className = '',
}: VoiceStateIndicatorProps) {
  const label = getLocalizedStateLabel(state, language);

  let dotColor = 'bg-accent';
  let badgeBg = 'bg-accent/10 border-accent/20 text-accent';

  if (state === 'LISTENING') {
    dotColor = 'bg-error animate-pulse';
    badgeBg = 'bg-error/10 border-error/20 text-error';
  } else if (state === 'PROCESSING' || state === 'CONNECTING' || state === 'RECONNECTING') {
    dotColor = 'bg-warning animate-pulse';
    badgeBg = 'bg-warning/10 border-warning/20 text-warning';
  } else if (state === 'SPEAKING') {
    dotColor = 'bg-success animate-pulse';
    badgeBg = 'bg-success/10 border-success/20 text-success';
  } else if (state === 'ERROR') {
    dotColor = 'bg-error';
    badgeBg = 'bg-error/10 border-error/20 text-error';
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium transition-all ${badgeBg} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      <span>{label}</span>
    </div>
  );
}

