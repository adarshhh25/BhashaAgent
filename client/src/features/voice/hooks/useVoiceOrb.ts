/**
 * Fibonacci Lattice Particle Sphere Animation Hook
 *
 * Implements the Claude Voice Orb from ai.html:
 * - 360-point Fibonacci sphere distribution with deterministic pseudo-random seeds
 * - Deep forest core radial gradient (#FFFFFF -> #DCE7DC -> #8FAF9B -> #17483A)
 * - 3 visual modes: idle, active (listening + speaking), processing
 * - Smooth exponential interpolation between states
 * - Perspective projection with depth sorting
 * - Clean requestAnimationFrame loop with high-DPI scaling
 * - Visibility change pausing and prefers-reduced-motion support
 */

import { useEffect, useRef } from 'react';
import type {
  VoiceOrbVisualState,
  VoiceOrbState,
  VoicePresentationState,
} from '../types/voice.types';
import { OrbRenderer } from '../components/voice-orb/OrbRenderer';
import { toVoiceOrbVisualState } from '../components/voice-orb/orb-constants';

export interface UseVoiceOrbOptions {
  state: VoiceOrbVisualState | VoiceOrbState | VoicePresentationState;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  sphereCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  ambientCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  containerSize?: number;
}

export function useVoiceOrb({
  state,
  canvasRef,
  sphereCanvasRef,
  containerSize = 220,
}: UseVoiceOrbOptions) {
  const visualState = toVoiceOrbVisualState(state);
  const rendererRef = useRef<OrbRenderer | null>(null);

  if (!rendererRef.current) {
    rendererRef.current = new OrbRenderer();
  }

  // Update target visual mode whenever state changes
  useEffect(() => {
    rendererRef.current?.setVisualMode(visualState);
  }, [visualState]);

  useEffect(() => {
    // Support either canvasRef or sphereCanvasRef for backwards compatibility
    const targetCanvas = canvasRef?.current || sphereCanvasRef?.current;
    if (!targetCanvas) return;

    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    const renderer = rendererRef.current!;
    renderer.setVisualMode(visualState);
    renderer.resetTimer();

    let rafId = 0;
    let size = containerSize;
    let dpr = 1;

    // Prefers-reduced-motion check
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let motionScale = mediaQuery.matches ? 0.3 : 1;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      motionScale = e.matches ? 0.3 : 1;
    };
    mediaQuery.addEventListener?.('change', handleMotionChange);

    // DPR-aware resolution setup
    const updateSize = () => {
      const rect = targetCanvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = rect.width || containerSize;
      targetCanvas.width = Math.round(size * dpr);
      targetCanvas.height = Math.round(size * dpr);
    };

    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(targetCanvas);

    // Animation frame loop
    const frame = (now: number) => {
      renderer.render(ctx, size, dpr, motionScale, now);
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    // Pause animation when tab or panel is hidden to preserve CPU/battery
    const handleVisibility = () => {
      cancelAnimationFrame(rafId);
      if (!document.hidden) {
        renderer.resetTimer();
        rafId = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handleVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      mediaQuery.removeEventListener?.('change', handleMotionChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handleVisibility);
    };
  }, [canvasRef, sphereCanvasRef, containerSize, visualState]);

  return { visualState };
}
