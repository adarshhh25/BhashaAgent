import { Play, Pause, Square, Volume2 } from 'lucide-react';
import type { AudioPlaybackState } from '../types/voice.types';

interface VoicePlaybackControlsProps {
  playbackState: AudioPlaybackState;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  className?: string;
}

export function VoicePlaybackControls({
  playbackState,
  onPlay,
  onPause,
  onStop,
  className = '',
}: VoicePlaybackControlsProps) {
  const isPlaying = playbackState === 'PLAYING';
  const isPaused = playbackState === 'PAUSED';

  if (playbackState === 'IDLE' || playbackState === 'STOPPED') return null;

  return (
    <div
      className={`p-2.5 bg-card border border-divider rounded-xl shadow-xs flex items-center justify-between gap-3 text-xs ${className}`}
    >
      <div className="flex items-center gap-2 text-text-secondary min-w-0">
        <Volume2 className="w-4 h-4 text-accent shrink-0" />
        <span className="font-medium text-[11px] truncate">
          {isPlaying ? 'Playing assistant audio…' : isPaused ? 'Audio paused' : 'Voice response'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {isPlaying ? (
          <button
            type="button"
            onClick={onPause}
            aria-label="Pause audio"
            className="p-1.5 rounded-lg border border-divider hover:bg-page-bg text-text-secondary hover:text-text-primary transition-colors"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        ) : isPaused ? (
          <button
            type="button"
            onClick={onPlay}
            aria-label="Resume audio"
            className="p-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors shadow-2xs"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onStop}
          aria-label="Stop playback"
          className="p-1.5 rounded-lg border border-divider hover:bg-page-bg text-text-secondary hover:text-error transition-colors"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
        </button>
      </div>
    </div>
  );
}

