import { useRef } from 'react';
import { useVoiceOrb } from '../hooks/useVoiceOrb';
import type { VoiceOrbState } from '../types/voice.types';

interface VoiceOrbProps {
  state: VoiceOrbState;
  size?: number;
  label?: string;
  sublabel?: string;
  onClick?: () => void;
  interactive?: boolean;
  className?: string;
}

export function VoiceOrb({
  state,
  size = 260,
  label,
  sublabel,
  onClick,
  interactive = true,
  className = '',
}: VoiceOrbProps) {
  const sphereCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ambientCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useVoiceOrb({
    state,
    ambientCanvasRef,
    sphereCanvasRef,
    containerSize: size,
  });

  const hasLabels = Boolean(label || sublabel);

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${className}`}
      style={{ width: `${size + 40}px`, height: hasLabels ? `${size + 60}px` : `${size}px` }}
    >
      {/* Ambient background glow canvas */}
      <canvas
        ref={ambientCanvasRef}
        className="absolute pointer-events-none transition-opacity duration-500"
        style={{
          width: `${size + 60}px`,
          height: `${size + 60}px`,
          top: '0px',
        }}
      />

      {/* Main interactive particle sphere */}
      <div
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={label ? `${label} - Voice assistant` : 'Voice assistant orb'}
        onClick={interactive ? onClick : undefined}
        onKeyDown={(e) => {
          if (interactive && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={`relative z-10 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          interactive ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-transform' : ''
        }`}
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <canvas ref={sphereCanvasRef} className="block" />
      </div>

      {/* State label and instruction */}
      {(label || sublabel) && (
        <div className="relative z-10 flex flex-col items-center text-center mt-2 px-2">
          {label && (
            <span className="text-xs font-semibold text-text-primary tracking-tight">
              {label}
            </span>
          )}
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

