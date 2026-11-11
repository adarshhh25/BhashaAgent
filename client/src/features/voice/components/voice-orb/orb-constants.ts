import type { VoiceOrbVisualState, OrbModeConfig, OrbPoint } from './orb-types';

export const N = 360;
export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Deterministic pseudo-random generator matching ai.html.
 */
const rnd = (i: number, salt: number) =>
  Math.abs(Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1;

/**
 * 360-point Fibonacci sphere distribution with deterministic attributes.
 */
export const ORB_POINTS: OrbPoint[] = (() => {
  const points: OrbPoint[] = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = GOLDEN * i;
    points.push({
      x: Math.cos(th) * r,
      y,
      z: Math.sin(th) * r,
      size: 0.6 + rnd(i, 1) * 1.6,
      alpha: 0.35 + rnd(i, 2) * 0.65,
      phase: rnd(i, 3) * Math.PI * 2,
      tone: rnd(i, 4),
    });
  }
  return points;
})();

/**
 * Visual parameters per visual mode from ai.html.
 * listening and speaking both map to 'active' (same visual animation).
 */
export const ORB_MODES: Record<VoiceOrbVisualState, OrbModeConfig> = {
  idle: {
    speed: 0.12,
    breath: 0.025,
    wave: 0.0,
    brightness: 0.85,
    glow: 0.45,
    pulse: 0.0,
    inOut: 0.0,
    core: 0.85,
  },
  active: {
    speed: 0.42,
    breath: 0.06,
    wave: 0.08,
    brightness: 1.0,
    glow: 1.0,
    pulse: 0.1,
    inOut: 0.0,
    core: 1.0,
  },
  processing: {
    speed: 0.22,
    breath: 0.03,
    wave: 0.03,
    brightness: 0.95,
    glow: 0.7,
    pulse: 0.0,
    inOut: 0.1,
    core: 0.9,
  },
};

/**
 * Maps any application voice state or legacy orb state to the 3 visual modes:
 * - IDLE, REQUESTING_PERMISSION, INTERRUPTED, CANCELLING, ERROR, idle -> 'idle'
 * - LISTENING, SPEAKING, listening, speaking, active -> 'active'
 * - PROCESSING, CONNECTING, RECONNECTING, thinking, processing -> 'processing'
 */
export function toVoiceOrbVisualState(state?: string): VoiceOrbVisualState {
  if (!state) return 'idle';
  const s = state.toLowerCase();
  if (s === 'active' || s === 'listening' || s === 'speaking') {
    return 'active';
  }
  if (
    s === 'processing' ||
    s === 'thinking' ||
    s === 'connecting' ||
    s === 'reconnecting'
  ) {
    return 'processing';
  }
  return 'idle';
}

