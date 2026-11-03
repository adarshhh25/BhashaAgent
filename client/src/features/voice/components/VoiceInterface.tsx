import { MessageSquare, X } from 'lucide-react';
import { VoiceOrb } from './VoiceOrb';
import { MicrophoneButton } from './MicrophoneButton';
import { VoiceStateIndicator } from './VoiceStateIndicator';
import { TranscriptPreview } from './TranscriptPreview';
import { VoicePlaybackControls } from './VoicePlaybackControls';
import { VoiceErrorMessage } from './VoiceErrorMessage';
import { useVoiceState } from '../hooks/useVoiceState';
import { getVoiceStrings } from '../utils/voice-translations';
import type { SupportedLanguage } from '../../conversations/types/conversation.types';

interface VoiceInterfaceProps {
  conversationId?: string | null;
  conversationTitle?: string | null;
  conversationStatus?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  selectedLanguage: SupportedLanguage;
  onClose: () => void;
  onSendTranscriptMessage?: (text: string) => Promise<void>;
  className?: string;
}

export function VoiceInterface({
  conversationId,
  conversationTitle,
  conversationStatus,
  selectedLanguage,
  onClose,
  onSendTranscriptMessage,
  className = '',
}: VoiceInterfaceProps) {
  const strings = getVoiceStrings(selectedLanguage);

  const {
    presentationState,
    orbState,
    transcript,
    playbackState,
    errorMessage,
    startListening,
    stopListening,
    cancelVoice,
    pausePlayback,
    resumePlayback,
    stopPlayback,
  } = useVoiceState({
    conversationId,
    conversationStatus,
    onFinalizedTurn: onSendTranscriptMessage,
  });

  const isListening = presentationState === 'LISTENING';
  const isSpeaking = presentationState === 'SPEAKING';

  return (
    <div
      className={`flex-1 flex flex-col justify-between p-3.5 min-h-0 overflow-y-auto bg-page-bg relative select-none animate-fade-in ${className}`}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-3 relative z-20 shrink-0">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-text-primary tracking-tight truncate">
            {strings.voiceModeTitle}
          </h2>
          <p className="text-[11px] text-text-secondary truncate mt-0.5">
            {conversationTitle || 'Active Conversation'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={strings.switchText}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-divider bg-card hover:bg-page-bg text-text-secondary hover:text-text-primary text-xs font-medium transition-colors shadow-2xs shrink-0 cursor-pointer"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
        </button>
      </div>

      {/* Center Voice Orb & Live Transcript */}
      <div className="flex-1 flex flex-col items-center justify-center py-2 min-h-0 relative z-10">
        <VoiceOrb
          state={orbState}
          size={120}
          onClick={() => {
            if (isListening) {
              stopListening();
            } else {
              void startListening();
            }
          }}
          interactive={true}
        />

        <VoiceStateIndicator
          state={presentationState}
          language={selectedLanguage}
          className="mt-2"
        />

        {/* Live Transcript Preview */}
        <div className="w-full max-w-xs mt-2.5">
          <TranscriptPreview
            transcript={transcript}
            language={selectedLanguage}
          />
        </div>

        {/* Error message card if present */}
        {errorMessage && (
          <div className="w-full max-w-xs mt-2">
            <VoiceErrorMessage message={errorMessage} onRetry={() => void startListening()} />
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="flex flex-col items-center gap-2.5 relative z-20 pt-1 pb-4 shrink-0">
        {/* Playback Controls (visible when assistant speaks) */}
        {isSpeaking && (
          <div className="animate-fade-in">
            <VoicePlaybackControls
              playbackState={playbackState}
              onPlay={() => void resumePlayback()}
              onPause={() => void pausePlayback()}
              onStop={stopPlayback}
            />
          </div>
        )}

        {/* Main Microphone Action Button */}
        <div className="flex items-center gap-4">
          <MicrophoneButton
            state={presentationState}
            onStart={() => void startListening()}
            onStop={stopListening}
            size="large"
          />

          {(isListening || isSpeaking || presentationState === 'PROCESSING') && (
            <button
              type="button"
              onClick={cancelVoice}
              title={strings.cancel}
              className="p-2.5 rounded-full bg-card hover:bg-black/5 text-text-secondary hover:text-error border border-divider transition-colors shadow-2xs cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
