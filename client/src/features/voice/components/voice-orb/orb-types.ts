import type { VoiceOrbVisualState, VoiceOrbState, VoicePresentationState } from '../../types/voice.types';

export type { VoiceOrbVisualState, VoiceOrbState, VoicePresentationState };

export interface OrbPoint {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  phase: number;
  tone: number;
}

export interface OrbModeConfig {
  speed: number;
  breath: number;
  wave: number;
  brightness: number;
  glow: number;
  pulse: number;
  inOut: number;
  core: number;
}

export interface ProjectedPoint {
  px: number;
  py: number;
  depth: number;
  p: OrbPoint;
}

