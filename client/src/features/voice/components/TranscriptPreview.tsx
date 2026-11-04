import type { VoiceTranscript } from '../types/voice.types';
import type { SupportedLanguage } from '../../conversations/types/conversation.types';
import { getVoiceStrings } from '../utils/voice-translations';

interface TranscriptPreviewProps {
  transcript: VoiceTranscript | null;
  language?: SupportedLanguage;
  className?: string;
}

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English (EN)',
  hi: 'हिन्दी (HI)',
  mr: 'मराठी (MR)',
  hinglish: 'Hinglish (HI-EN)',
};

export function TranscriptPreview({
  transcript,
  language = 'en',
  className = '',
}: TranscriptPreviewProps) {
  const strings = getVoiceStrings(language);
  const text = transcript?.text?.trim();

  return (
    <div
      className={`min-h-[56px] p-3 rounded-xl border border-divider/80 bg-card text-center flex flex-col items-center justify-center transition-all shadow-2xs ${className}`}
    >
      {text ? (
        <p className="text-xs text-text-primary font-medium leading-relaxed max-w-[280px] break-words">
          &ldquo;{text}&rdquo;
          {!transcript?.isFinal && (
            <span className="inline-block w-1.5 h-3 ml-1 bg-[#17483A] animate-pulse align-middle" />
          )}
        </p>
      ) : (
        <p className="text-[11px] text-text-placeholder leading-normal max-w-[260px]">
          {strings.transcriptPlaceholder}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="text-[9px] uppercase tracking-wider text-text-secondary font-mono px-1.5 py-0.5 rounded bg-page-bg border border-divider/60">
          {transcript?.detectedLanguageCode
            ? `Detected: ${transcript.detectedLanguageCode}`
            : `Voice Lang: ${LANGUAGE_LABELS[language] || language.toUpperCase()}`}
        </span>
      </div>
    </div>
  );
}
