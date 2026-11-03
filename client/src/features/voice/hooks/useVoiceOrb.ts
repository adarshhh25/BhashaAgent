/**
 * Fibonacci Lattice Particle Sphere Animation Hook
 *
 * Adapted faithfully from voice-orb-sphere.html:
 * - 260-point Fibonacci sphere distribution
 * - State-driven rotation, tilt, and radial ambient glow
 * - Perspective projection with depth sorting
 * - Clean requestAnimationFrame loop with high-DPI scaling
 * - Reduced motion support & memory leak prevention
 */

import { useEffect, useRef } from 'react';
import type { VoiceOrbState } from '../types/voice.types';

const TIME_SCALE = 0.35;
const N = 260;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Pre-calculate 260-point Fibonacci lattice on unit sphere
const SPHERE_POINTS: Array<{ x: number; y: number; z: number; seed: number }> = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const theta = GOLDEN * i;
  SPHERE_POINTS.push({
    x: Math.cos(theta) * r,
    y,
    z: Math.sin(theta) * r,
    seed: Math.random() * Math.PI * 2,
  });
}

const PRESETS: Record<
  VoiceOrbState,
  { spin: number; flatten: number; tilt: number; size: number; alpha: number }
> = {
  idle: { spin: 0.2, flatten: 0, tilt: 0.25, size: 1.8, alpha: 0.6 },
  listening: { spin: 0.45, flatten: 0, tilt: 0.45, size: 1.8, alpha: 0.65 },
  thinking: { spin: 1.0, flatten: 0, tilt: 0.15, size: 1.8, alpha: 0.6 },
  speaking: { spin: 0.3, flatten: 0, tilt: 0.35, size: 1.8, alpha: 0.65 },
};

const AMBIENT_COLORS: Record<VoiceOrbState, [number, number, number]> = {
  idle: [143, 193, 247],
  listening: [120, 200, 230],
  thinking: [185, 170, 240],
  speaking: [245, 190, 150],
};

const DOT_COLORS: Record<VoiceOrbState, [number, number, number]> = {
  idle: [0, 113, 227], // BhashaAgent primary accent #0071E3
  listening: [0, 140, 210],
  thinking: [70, 95, 215],
  speaking: [215, 115, 60],
};

function level(t: number, s: VoiceOrbState): number {
  if (s === 'listening') return 0.5 + 0.5 * Math.sin(t * 4.1) * Math.sin(t * 1.7 + 0.5);
  if (s === 'speaking') return 0.3 + 0.7 * Math.abs(Math.sin(t * 5.5) * Math.cos(t * 2.3));
  return 0;
}

interface UseVoiceOrbOptions {
  state: VoiceOrbState;
  ambientCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  sphereCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerSize?: number;
}

export function useVoiceOrb({
  state,
  ambientCanvasRef,
  sphereCanvasRef,
  containerSize = 280,
}: UseVoiceOrbOptions) {
  const stateRef = useRef<VoiceOrbState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const sphereCanvas = sphereCanvasRef.current;
    const ambientCanvas = ambientCanvasRef.current;
    if (!sphereCanvas || !ambientCanvas) return;

    const ctx = sphereCanvas.getContext('2d');
    const actx = ambientCanvas.getContext('2d');
    if (!ctx || !actx) return;

    let animId: number;
    let time = 0;
    let last = performance.now();
    let rot = 0;

    const cur = { ...PRESETS[stateRef.current] };
    const glow = [...AMBIENT_COLORS[stateRef.current]];
    const dotRGB = [...DOT_COLORS[stateRef.current]];

    // Check prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = mediaQuery.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };
    mediaQuery.addEventListener?.('change', handleMotionChange);

    // Setup high-DPI scaling
    const setupCanvasResolution = () => {
      const dpr = window.devicePixelRatio || 1;
      const size = containerSize;

      sphereCanvas.width = size * dpr;
      sphereCanvas.height = size * dpr;
      sphereCanvas.style.width = `${size}px`;
      sphereCanvas.style.height = `${size}px`;

      ambientCanvas.width = (size + 60) * dpr;
      ambientCanvas.height = (size + 60) * dpr;
      ambientCanvas.style.width = `${size + 60}px`;
      ambientCanvas.style.height = `${size + 60}px`;
    };

    setupCanvasResolution();

    const drawAmbient = (alpha: number) => {
      const w = ambientCanvas.width;
      const h = ambientCanvas.height;
      actx.clearRect(0, 0, w, h);
      const [r, g, b] = glow;
      const grad = actx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.5);
      grad.addColorStop(0, `rgba(${r ?? 143},${g ?? 193},${b ?? 247},${alpha})`);
      grad.addColorStop(1, `rgba(${r ?? 143},${g ?? 193},${b ?? 247},0)`);
      actx.fillStyle = grad;
      actx.fillRect(0, 0, w, h);
    };

    const render = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const currentScale = reducedMotion ? TIME_SCALE * 0.2 : TIME_SCALE;
      time += dt * currentScale;

      const target = PRESETS[stateRef.current];
      const k = 1 - Math.pow(0.001, dt);

      for (const key in target) {
        const prop = key as keyof typeof target;
        cur[prop] += (target[prop] - cur[prop]) * k;
      }

      const gc = AMBIENT_COLORS[stateRef.current];
      for (let i = 0; i < 3; i++) {
        const val = gc[i];
        const gVal = glow[i];
        if (val !== undefined && gVal !== undefined) {
          glow[i] = gVal + (val - gVal) * k;
        }
      }

      const dc = DOT_COLORS[stateRef.current];
      for (let i = 0; i < 3; i++) {
        const val = dc[i];
        const dVal = dotRGB[i];
        if (val !== undefined && dVal !== undefined) {
          dotRGB[i] = dVal + (val - dVal) * k;
        }
      }

      const lvl = level(time, stateRef.current);
      drawAmbient(0.14 + lvl * 0.05);

      rot += cur.spin * dt * currentScale * 4;
      const W = sphereCanvas.width;
      const H = sphereCanvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const R = W * 0.32;

      ctx.clearRect(0, 0, W, H);

      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const tiltA = Math.sin(cur.tilt * Math.PI) * 0.6;
      const cosT = Math.cos(tiltA);
      const sinT = Math.sin(tiltA);

      const projected: Array<{ sx: number; sy: number; depth: number; persp: number }> = [];

      for (let i = 0; i < SPHERE_POINTS.length; i++) {
        const p = SPHERE_POINTS[i];
        if (!p) continue;

        const y = p.y * (1 - cur.flatten * 0.85);
        const x = p.x;
        const z = p.z;

        // Rotate around Y axis
        const x1 = x * cosR + z * sinR;
        const z1 = -x * sinR + z * cosR;

        // Tilt around X axis
        const y2 = y * cosT - z1 * sinT;
        const z2 = y * sinT + z1 * cosT;

        const persp = 1 / (1.8 - z2 * 0.4);
        projected.push({
          sx: cx + x1 * R * persp,
          sy: cy + y2 * R * persp,
          depth: (z2 + 1) / 2,
          persp,
        });
      }

      projected.sort((a, b) => a.depth - b.depth);

      const r = Math.round(dotRGB[0] ?? 0);
      const g = Math.round(dotRGB[1] ?? 113);
      const b = Math.round(dotRGB[2] ?? 227);

      for (let i = 0; i < projected.length; i++) {
        const p = projected[i];
        if (!p) continue;

        const size = cur.size * p.persp * (0.8 + p.depth * 0.6) * (W / 640);
        const alpha = Math.min(1, (cur.alpha + lvl * 0.2) * (0.2 + p.depth * 0.8));

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, Math.max(size, 0.6), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      mediaQuery.removeEventListener?.('change', handleMotionChange);
    };
  }, [containerSize, ambientCanvasRef, sphereCanvasRef]);
}
