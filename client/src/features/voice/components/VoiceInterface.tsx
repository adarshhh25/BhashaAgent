import { ArrowLeft } from 'lucide-react';
import { VoiceOrb } from './VoiceOrb';
import { useVoiceState } from '../hooks/useVoiceState';
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
  conversationTitle: _conversationTitle,
  formTaskId,
  activeFormTitle: _activeFormTitle,
  fieldCount: _fieldCount = 0,
  conversationStatus,
  selectedLanguage,
  onClose,
  onSendTranscriptMessage,
  className = '',
}: VoiceInterfaceProps) {
  const {
    presentationState,
    orbState,
    startListening,
    stopListening,
    cancelVoice,
  } = useVoiceState({
    conversationId,
    formTaskId,
    conversationStatus,
    language: selectedLanguage,
    onFinalizedTurn: onSendTranscriptMessage,
  });

  const isListening = presentationState === 'LISTENING';
  const isSpeaking = presentationState === 'SPEAKING';
  const isActive = isListening || isSpeaking;

  const handleOrbClick = () => {
    if (presentationState === 'PROCESSING') return;
    if (isActive) {
      stopListening();
    } else {
      void startListening();
    }
  };

  return (
    <div
      className={`flex-1 flex flex-col justify-between h-full min-h-0 overflow-hidden px-4 pt-3 pb-6 bg-[#F7F6F1] relative select-none animate-fade-in ${className}`}
    >
      {/* Background illumination: only during active voice interaction (from ai.html) */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${
          isActive ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'radial-gradient(circle at center, rgba(220,231,220,0.55) 0%, rgba(220,231,220,0.25) 35%, #F7F6F1 75%)',
        }}
      />

      {/* Top Header Row with Back to Chat (minimal, no badges or URL) */}
      <header className="flex items-center justify-between relative z-20 shrink-0 h-10">
        <button
          type="button"
          onClick={() => {
            cancelVoice();
            onClose();
          }}
          className="flex items-center gap-1.5 text-xs text-[#17483A] hover:text-[#102A24] font-medium transition-colors focus:outline-none cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Chat</span>
        </button>
      </header>

      {/* Main Center Area: Large Voice Orb as the centerpiece */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-10 w-full min-h-0">
        <VoiceOrb
          state={orbState}
          size={240}
          onClick={handleOrbClick}
          interactive={presentationState !== 'PROCESSING'}
        />
      </main>

      {/* Invisible bottom spacer matching header height to keep orb vertically balanced */}
      <div className="h-10 shrink-0 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

export default VoiceInterface;
