import { Mic, Square, Loader2 } from 'lucide-react';
import type { VoicePresentationState } from '../types/voice.types';

interface MicrophoneButtonProps {
  state: VoicePresentationState;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  size?: 'default' | 'large';
  className?: string;
}

export function MicrophoneButton({
  state,
  onStart,
  onStop,
  disabled = false,
  size = 'default',
  className = '',
}: MicrophoneButtonProps) {
  const isListening = state === 'LISTENING';
  const isBusy =
    state === 'REQUESTING_PERMISSION' ||
    state === 'CONNECTING' ||
    state === 'RECONNECTING' ||
    state === 'PROCESSING' ||
    state === 'CANCELLING';

  const handleClick = () => {
    if (disabled || isBusy) return;
    if (isListening) {
      onStop();
    } else {
      onStart();
    }
  };

  const isLarge = size === 'large';
  const btnSizeClass = isLarge ? 'w-14 h-14' : 'w-12 h-12';
  const iconSizeClass = isLarge ? 'w-6 h-6' : 'w-5 h-5';

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Listening ambient animated wave */}
      {isListening && (
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[#17483A]/25 animate-ping pointer-events-none"
        />
      )}

      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isBusy}
        aria-label={isListening ? 'Stop listening' : 'Start voice interaction'}
        aria-pressed={isListening}
        className={`relative z-10 rounded-full flex items-center justify-center transition-all shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#17483A] cursor-pointer ${btnSizeClass} ${
          isListening
            ? 'bg-[#C5221F] text-white hover:bg-[#C5221F]/90 active:scale-95'
            : 'bg-[#17483A] text-white hover:bg-[#102A24] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed'
        }`}
      >
        {isBusy ? (
          <Loader2 className={`${iconSizeClass} animate-spin`} />
        ) : isListening ? (
          <Square className={`${iconSizeClass} fill-current`} />
        ) : (
          <Mic className={iconSizeClass} />
        )}
      </button>
    </div>
  );
}
