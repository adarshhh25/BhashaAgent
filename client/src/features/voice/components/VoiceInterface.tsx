import { MessageSquare, X, FileText } from 'lucide-react';
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
  formTaskId?: string | null;
  activeFormTitle?: string | null;
  fieldCount?: number;
  conversationStatus?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  selectedLanguage: SupportedLanguage;
  onClose: () => void;
  onSendTranscriptMessage?: (text: string) => Promise<void>;
  className?: string;
}

export function VoiceInterface({
  conversationId,
  conversationTitle,
  formTaskId,
  activeFormTitle,
  fieldCount = 0,
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
    assistantResponseText,
    errorMessage,
    startListening,
    stopListening,
    cancelVoice,
    pausePlayback,
    resumePlayback,
    stopPlayback,
  } = useVoiceState({
    conversationId,
    formTaskId,
    conversationStatus,
    language: selectedLanguage,
    onFinalizedTurn: onSendTranscriptMessage,
  });

  const isListening = presentationState === 'LISTENING';
  const isSpeaking = presentationState === 'SPEAKING';

  return (
    <div
      className={`flex-1 flex flex-col justify-between h-full min-h-0 overflow-hidden px-4 pt-3 pb-8 bg-page-bg relative select-none animate-fade-in ${className}`}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-3 relative z-20 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-text-primary tracking-tight truncate">
              {strings.voiceModeTitle}
            </h2>
            {activeFormTitle && (
              <span className="text-[10px] bg-[#DCE7DC] text-[#102A24] font-medium px-1.5 py-0.5 rounded border border-[#17483A]/20 truncate max-w-[140px] flex items-center gap-1">
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate">{activeFormTitle}</span>
              </span>
            )}
          </div>
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

      {/* Active Form Status Banner */}
      {activeFormTitle && fieldCount > 0 && (
        <div className="w-full max-w-xs mx-auto mt-2 px-3 py-1.5 bg-card border border-divider rounded-lg flex items-center justify-between text-[11px] text-text-primary shadow-2xs shrink-0 animate-fade-in">
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="font-medium truncate">{activeFormTitle}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-text-secondary shrink-0">
            <span className="text-accent font-medium">{fieldCount} {fieldCount === 1 ? 'field' : 'fields'} detected</span>
          </div>
        </div>
      )}

      {/* Center Voice Orb & Live Transcript */}
      <div className="flex-1 flex flex-col items-center justify-center py-2 min-h-0 overflow-y-auto relative z-10 w-full max-w-sm mx-auto space-y-2">
        <VoiceOrb
          state={orbState}
          size={96}
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
          className="mt-1"
        />

        {/* Live Transcript Preview (hide empty placeholder if an error message is active) */}
        {(Boolean(transcript?.text?.trim()) || !errorMessage) && (
          <div className="w-full max-w-xs">
            <TranscriptPreview
              transcript={transcript}
              language={selectedLanguage}
            />
          </div>
        )}

        {/* Assistant Response Text Preview */}
        {assistantResponseText && !errorMessage && (
          <div className="w-full max-w-xs p-2.5 bg-card border border-divider rounded-xl text-xs text-text-primary text-center shadow-2xs animate-fade-in">
            <p className="line-clamp-3 leading-relaxed">{assistantResponseText}</p>
          </div>
        )}

        {/* Error message card if present */}
        {errorMessage && (
          <div className="w-full max-w-xs">
            <VoiceErrorMessage message={errorMessage} onRetry={() => void startListening()} />
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="flex flex-col items-center gap-2.5 relative z-20 pt-2 pb-2 shrink-0">
        {/* Playback Controls (visible when assistant speaks) */}
        {isSpeaking && (
          <div className="animate-fade-in mb-1">
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
