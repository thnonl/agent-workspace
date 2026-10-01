import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { sfx } from '../audio';
import { env } from '../env';
import { host, pageActive } from '../pipHost';

interface Drop {
  x: number;
  y: number;
  v: number;
  s: number;
  ph: number;
}

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Rain and snow falling outside: a 2D canvas behind the 3D office (it shows through the windows and around the room).
 * Fog and clouds are plain CSS (see `.wx-*` in styles.css). Nothing is drawn in the "low" quality, in a hidden tab or
 * with reduced motion. A storm adds lightning flashes and thunder.
 */
export function WeatherLayer() {
  const weather = useStore((s) => s.weather);
  const quality = useStore((s) => s.quality);
  const pip = useStore((s) => s.pip);
  const canvas = useRef<HTMLCanvasElement>(null);
  const flash = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const kind = weather === 'rain' || weather === 'storm' ? 'rain' : weather === 'snow' ? 'snow' : null;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const fl = flash.current;
    if (fl) fl.style.opacity = '0';
    if (!kind || quality === 'low' || reduceMotion()) return;

    // (in the floating window the canvas is in another window: that one's size, frames and timers count)
    const win = host();
    let w = 0;
    let h = 0;
    const resize = () => {
      w = cv.width = Math.ceil(win.innerWidth);
      h = cv.height = Math.ceil(win.innerHeight);
    };
    resize();
    win.addEventListener('resize', resize);
    const n = Math.round((kind === 'rain' ? 48 : 130) * (quality === 'high' ? 1.4 : 1) * (weather === 'storm' ? 1.4 : 1));
    const drops: Drop[] = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      v: kind === 'rain' ? 520 + Math.random() * 360 : 38 + Math.random() * 60,
      s: kind === 'rain' ? 9 + Math.random() * 14 : 1.1 + Math.random() * 2.2,
      ph: Math.random() * 6.28,
    }));

    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      raf = win.requestAnimationFrame(loop);
      if (!pageActive() || t - last < 30) return;
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      if (kind === 'rain') {
        // dark streaks against the bright day sky, pale ones at night
        const a = weather === 'storm' ? 0.42 : 0.3;
        ctx.strokeStyle = env.night > 0.5 ? `rgba(205, 220, 255, ${a})` : `rgba(92, 108, 160, ${a})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const d of drops) {
          d.y += d.v * dt;
          d.x -= d.v * dt * 0.16;
          if (d.y > h + 20 || d.x < -20) {
            d.y = -20 - Math.random() * 60;
            d.x = Math.random() * (w + 200);
          }
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.s * 0.16, d.y - d.s);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = env.night > 0.5 ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.95)';
        for (const d of drops) {
          d.y += d.v * dt;
          d.x += Math.sin(t / 1000 + d.ph) * 14 * dt;
          if (d.y > h + 6) {
            d.y = -6;
            d.x = Math.random() * w;
          }
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.s, 0, 6.283);
          ctx.fill();
        }
      }
    };
    raf = win.requestAnimationFrame(loop);

    // lightning: a quick double flash, thunder a moment later
    let timer = 0;
    const strike = () => {
      if (!fl) return;
      [0.85, 0.15, 0.6, 0].forEach((o, i) => window.setTimeout(() => { fl.style.opacity = String(o); }, i * 90));
      window.setTimeout(() => sfx('thunder'), 350 + Math.random() * 900);
      timer = window.setTimeout(strike, 7000 + Math.random() * 12000);
    };
    if (weather === 'storm') timer = window.setTimeout(strike, 3000 + Math.random() * 5000);

    return () => {
      win.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      win.removeEventListener('resize', resize);
    };
  }, [weather, quality, pip]);

  return (
    <>
      <canvas ref={canvas} className="weather" aria-hidden="true" />
      <div ref={flash} className="weather-flash" aria-hidden="true" />
    </>
  );
}
