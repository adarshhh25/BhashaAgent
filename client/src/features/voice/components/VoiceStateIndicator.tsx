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

  let dotColor = 'bg-[#17483A]';
  let badgeBg = 'bg-[#17483A]/10 border-[#17483A]/20 text-[#17483A]';

  if (state === 'LISTENING') {
    dotColor = 'bg-[#102A24] animate-pulse';
    badgeBg = 'bg-[#DCE7DC] border-[#17483A]/30 text-[#102A24] font-semibold';
  } else if (state === 'PROCESSING' || state === 'CONNECTING' || state === 'RECONNECTING') {
    dotColor = 'bg-[#B25000] animate-pulse';
    badgeBg = 'bg-[#B25000]/10 border-[#B25000]/25 text-[#B25000]';
  } else if (state === 'SPEAKING') {
    dotColor = 'bg-[#1E6B42] animate-pulse';
    badgeBg = 'bg-[#1E6B42]/10 border-[#1E6B42]/25 text-[#1E6B42]';
  } else if (state === 'ERROR') {
    dotColor = 'bg-[#C5221F]';
    badgeBg = 'bg-[#C5221F]/10 border-[#C5221F]/25 text-[#C5221F]';
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
