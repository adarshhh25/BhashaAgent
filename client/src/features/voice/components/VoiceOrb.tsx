import { useRef } from 'react';
import { useVoiceOrb } from '../hooks/useVoiceOrb';
import type {
  VoiceOrbState,
  VoiceOrbVisualState,
  VoicePresentationState,
} from '../types/voice.types';
import { toVoiceOrbVisualState } from './voice-orb/orb-constants';

export interface VoiceOrbProps {
  state: VoiceOrbVisualState | VoiceOrbState | VoicePresentationState;
  size?: number;
  label?: string;
  sublabel?: string;
  onClick?: () => void;
  interactive?: boolean;
  disabled?: boolean;
  className?: string;
}

export function VoiceOrb({
  state,
  size = 240,
  label,
  sublabel,
  onClick,
  interactive = true,
  disabled = false,
  className = '',
}: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualState = toVoiceOrbVisualState(state);

  useVoiceOrb({
    state,
    canvasRef,
    containerSize: size,
  });

  const isInteractive = interactive && !disabled && visualState !== 'processing';

  // Opacity for soft outer sage glow matching ai.html
  const glowOpacityClass =
    visualState === 'active'
      ? 'opacity-100'
      : visualState === 'processing'
      ? 'opacity-75'
      : 'opacity-45';

  // Per spec: Display only "Tap to speak" in idle mode, no text during active/processing
  const displayLabel = visualState === 'idle' ? (label ?? 'Tap to speak') : null;

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${className}`}
      data-visual={visualState}
    >
      {/* Orb Stage Container */}
      <div
        className="relative"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          maxWidth: '100%',
          aspectRatio: '1',
        }}
      >
        {/* Soft outer sage glow behind the orb from ai.html */}
        <span
          aria-hidden="true"
          className={`absolute inset-[-12%] rounded-full pointer-events-none transition-opacity duration-800 ${glowOpacityClass}`}
          style={{
            background:
              'radial-gradient(circle, rgba(143, 175, 155, 0.35) 0%, transparent 65%)',
          }}
        />

        {/* Interactive Orb Button */}
        <button
          type="button"
          onClick={isInteractive ? onClick : undefined}
          disabled={!isInteractive}
          aria-label={
            visualState === 'idle'
              ? 'Start voice conversation'
              : visualState === 'active'
              ? 'Voice conversation in progress'
              : 'Processing your request'
          }
          className={`relative z-10 w-full h-full rounded-full block border-none bg-transparent p-0 focus:outline-none focus-visible:outline-2 focus-visible:outline-[#17483A] focus-visible:outline-offset-8 transition-transform duration-200 ${
            isInteractive
              ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
              : 'cursor-default'
          }`}
        >
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="w-full h-full block rounded-full"
          />
        </button>
      </div>

      {/* State label - displays "Tap to speak" only in idle mode per spec */}
      {displayLabel && (
        <div className="relative z-10 flex flex-col items-center text-center mt-3 px-2 min-h-[1.4em]">
          <span className="text-xs sm:text-sm font-medium text-[#102A24] tracking-wide transition-opacity duration-400">
            {displayLabel}
          </span>
          {sublabel && (
            <span className="text-[11px] text-text-secondary mt-0.5 max-w-[240px] truncate">
              {sublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default VoiceOrb;
