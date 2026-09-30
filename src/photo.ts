import { useStore } from './store';
import { sfx } from './audio';
import { pushToast } from './toast';
import { celestial, env } from './env';
import { OVERCAST } from './weather';

/** Set by the 3D scene: draws one frame right now and returns the canvas it drew into. */
export const photoHooks = { render: null as (() => HTMLCanvasElement) | null };

/**
 * Saves what the screen shows (the sky, the office, without the buttons and speech bubbles) as a PNG.
 * The WebGL canvas is transparent and the sky is CSS, so the sky is painted first on a 2D canvas.
 */
export function takePhoto() {
  const gl = photoHooks.render?.();
  if (!gl) return;
  const w = gl.width;
  const h = gl.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d');
  if (!g) return;
  const app = document.querySelector('.app');
  const css = app ? getComputedStyle(app) : null;
  const sky1 = css?.getPropertyValue('--sky1').trim() || '#ffe9f0';
  const sky2 = css?.getPropertyValue('--sky2').trim() || '#ffd0b5';
  const grad = g.createLinearGradient(0, 0, w * 0.35, h);
  grad.addColorStop(0, sky1);
  grad.addColorStop(1, sky2);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  const st = useStore.getState();
  const k = w / Math.max(1, gl.clientWidth || w);
  const wx = OVERCAST[st.weather];
  if (env.night > 0.3) {
    g.fillStyle = `rgba(255,255,255,${Math.min(1, env.night * 1.2 - 0.25) * (1 - wx)})`;
    for (let i = 0; i < 70; i++) {
      const s = (1 + ((i * 7) % 3)) * k * 0.8;
      g.fillRect(((i * 37.7) % 100) / 100 * w, ((i * 53.3) % 62) / 100 * h, s, s);
    }
  }
  const body = celestial(st.hour);
  if (body.alpha > 0.02) {
    const r = 37 * k;
    const x = body.x * w;
    const y = body.y * h;
    const orb = g.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
    if (body.kind === 'sun') {
      orb.addColorStop(0, '#fffbe0');
      orb.addColorStop(0.55, '#ffe27a');
      orb.addColorStop(1, '#ffb84d');
    } else {
      orb.addColorStop(0, '#ffffff');
      orb.addColorStop(0.6, '#e5e9ff');
      orb.addColorStop(1, '#b8c1ee');
    }
    g.globalAlpha = body.alpha * (1 - 0.9 * wx);
    g.fillStyle = orb;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  if (wx > 0) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = wx * 0.62;
    const veil = g.createLinearGradient(0, 0, 0, h);
    veil.addColorStop(0, '#6f768b');
    veil.addColorStop(1, '#a4aabd');
    g.fillStyle = veil;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  g.drawImage(gl, 0, 0);

  g.font = `700 ${Math.round(15 * k)}px Nunito Variable, system-ui, sans-serif`;
  g.textAlign = 'right';
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.shadowColor = 'rgba(40,30,70,0.5)';
  g.shadowBlur = 4 * k;
  g.fillText('Agent Workspace', w - 18 * k, h - 16 * k);

  const room = st.activeRoomId ? st.rooms[st.activeRoomId] : null;
  const d = new Date();
  const p2 = (v: number) => String(v).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const name = `agent-workspace-${(room?.project || 'office').replace(/[^\w-]+/g, '_').slice(0, 24)}-${stamp}.png`;
  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    sfx('shutter');
    pushToast({ icon: 'camera', title: 'Photo saved', text: name });
    document.querySelector('.app')?.classList.add('photo-flash');
    setTimeout(() => document.querySelector('.app')?.classList.remove('photo-flash'), 400);
  }, 'image/png');
}
