import type { VoiceOrbVisualState, OrbModeConfig, ProjectedPoint } from './orb-types';
import { N, ORB_POINTS, ORB_MODES } from './orb-constants';

export class OrbRenderer {
  private current: OrbModeConfig = { ...ORB_MODES.idle };
  private target: OrbModeConfig = ORB_MODES.idle;
  private angle = 0;
  private t = 0;
  private last = performance.now();

  public setVisualMode(mode: VoiceOrbVisualState) {
    this.target = ORB_MODES[mode] || ORB_MODES.idle;
  }

  public resetTimer() {
    this.last = performance.now();
  }

  public render(
    ctx: CanvasRenderingContext2D,
    size: number,
    dpr: number,
    motionScale: number,
    now: number
  ) {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.t += dt;

    // Smoothly interpolate toward target so state changes never snap
    const k = 1 - Math.exp(-dt * 3);
    for (const key in this.target) {
      const prop = key as keyof OrbModeConfig;
      this.current[prop] += (this.target[prop] - this.current[prop]) * k;
    }

    this.angle += dt * this.current.speed * motionScale;

    const cx = size / 2;
    const cy = size / 2;
    const scale = size / 340;
    const breath = Math.sin(this.t * 0.9) * this.current.breath * motionScale;
    const R = size * 0.36 * (1 + breath);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Deep forest core radial gradient
    ctx.globalAlpha = 0.85 * this.current.core;
    const core = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.05);
    core.addColorStop(0, '#FFFFFF');
    core.addColorStop(0.3, '#DCE7DC');
    core.addColorStop(0.65, '#8FAF9B');
    core.addColorStop(0.92, '#17483A');
    core.addColorStop(1, 'rgba(23,72,58,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
    ctx.fill();

    // Project particles
    const ca = Math.cos(this.angle);
    const sa = Math.sin(this.angle);
    const tilt = 0.3;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const waveT = this.t * 2.2 * motionScale;

    const projected: ProjectedPoint[] = [];

    for (let i = 0; i < N; i++) {
      const p = ORB_POINTS[i];
      if (!p) continue;
      const phi = Math.acos(Math.max(-1, Math.min(1, p.y)));

      // Y-axis rotation, then X-axis tilt
      const rx = p.x * ca + p.z * sa;
      const rz = -p.x * sa + p.z * ca;
      const ry = p.y * ct - rz * st;
      const rz2 = p.y * st + rz * ct;

      // Radius modulation: waves, pulses, inward/outward motion
      let waveR = 1;
      if (this.current.wave) {
        waveR +=
          this.current.wave *
          motionScale *
          Math.sin(phi * 3 - waveT + p.phase * 0.2);
      }
      if (this.current.inOut) {
        waveR +=
          this.current.inOut *
          Math.sin(this.t * 0.9 + p.phase * 0.3) *
          (0.5 + 0.5 * p.tone);
      }
      if (this.current.pulse) {
        const s = Math.max(0, Math.sin(this.t * 3.2 - phi * 2));
        waveR += this.current.pulse * motionScale * s * s * s;
      }

      const persp = 1 + rz2 * 0.18;
      const rr = R * waveR * persp;
      projected.push({
        px: cx + rx * rr,
        py: cy + ry * rr,
        depth: (rz2 + 1) / 2,
        p,
      });
    }

    // Depth sorting back to front
    projected.sort((a, b) => a.depth - b.depth);

    for (const q of projected) {
      const d = q.depth;
      const alpha = q.p.alpha * (0.45 + 0.55 * d) * this.current.brightness;
      const s = q.p.size * (0.7 + 0.6 * d) * scale;

      // Back-facing particles recede into the Primary Green body;
      // front-facing ones read as sage, with mint and white sparks.
      let color: string;
      if (d < 0.45) {
        color = '143,175,155'; // sage, recessed
      } else if (d > 0.93 && q.p.tone > 0.92) {
        color = '255,255,255'; // white sparks
      } else if (q.p.tone < 0.7) {
        color = '143,175,155'; // sage
      } else {
        color = '220,231,220'; // soft mint
      }

      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = `rgb(${color})`;
      ctx.beginPath();
      ctx.arc(q.px, q.py, s, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft highlight at upper-left for 3D sphere volume
    ctx.globalAlpha = 0.16 * this.current.brightness;
    const hl = ctx.createRadialGradient(
      cx - R * 0.35,
      cy - R * 0.4,
      0,
      cx - R * 0.35,
      cy - R * 0.4,
      R * 0.7
    );
    hl.addColorStop(0, 'rgba(255,255,255,0.9)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }
}
