import { addAfterEffect, addEffect } from '@react-three/fiber';
import type * as THREE from 'three';
import { frame } from './sim/frame';
import { useStore } from './store';

/**
 * Development statistics panel (`npm run dev`, open the app with `?perf`); Scene.tsx loads it only in dev builds, so production never
 * contains it. Updated twice a second from the frame loop, so a still scene (fewer frames) costs nothing extra.
 * - fps: frames the renderer really drew (the canvas renders on demand, so this is the governor's rate, not the display's)
 * - cpu: milliseconds per frame from the start of the frame loop to the end of the render call (simulation + three's draw submission)
 * - gpu: EXT_disjoint_timer_query_webgl2 around the same span, "n/a" where the browser does not offer it
 */
const WINDOW_MS = 500;
/** the scene is walked (to count meshes) every this many windows */
const SCENE_EVERY = 4;
const LONG_TASK_KEEP_MS = 10_000;

interface GpuTimer {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export function startPerfOverlay(gl: THREE.WebGLRenderer, scene: THREE.Scene): () => void {
  const el = document.createElement('pre');
  el.style.cssText =
    "position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre;" +
    "font:11px/1.4 'JetBrains Mono Variable',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:#cfffd6;background:rgba(10,12,20,.8)";
  el.textContent = 'perf…';
  document.body.appendChild(el);

  const ctx = gl.getContext() as WebGL2RenderingContext;
  const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimer | null;
  let active: WebGLQuery | null = null;
  const pending: { q: WebGLQuery; drew: boolean }[] = [];

  const longTasks: { at: number; ms: number }[] = [];
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push({ at: performance.now(), ms: e.duration });
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    observer = null;
  }

  let t0 = 0;
  let seenFrame = gl.info.render.frame;
  let winStart = performance.now();
  let winFrames = 0;
  let cpuSum = 0;
  let cpuMax = 0;
  let gpuSum = 0;
  let gpuN = 0;
  let windows = 0;
  let meshes = '';

  const stopBefore = addEffect(() => {
    t0 = performance.now();
    if (ext && !active) {
      active = ctx.createQuery();
      ctx.beginQuery(ext.TIME_ELAPSED_EXT, active);
    }
  });

  const stopAfter = addAfterEffect(() => {
    const now = performance.now();
    const drew = gl.info.render.frame !== seenFrame;
    seenFrame = gl.info.render.frame;
    if (ext && active) {
      ctx.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push({ q: active, drew });
      active = null;
    }
    if (drew) {
      const cpu = now - t0;
      winFrames++;
      cpuSum += cpu;
      if (cpu > cpuMax) cpuMax = cpu;
    }
    if (ext) {
      // results arrive a few frames late, in order; a disjoint timer (power state change, context switch) invalidates the sample
      while (pending.length) {
        const p = pending[0];
        if (!ctx.getQueryParameter(p.q, ctx.QUERY_RESULT_AVAILABLE)) break;
        const disjoint = ctx.getParameter(ext.GPU_DISJOINT_EXT);
        if (p.drew && !disjoint) {
          gpuSum += (ctx.getQueryParameter(p.q, ctx.QUERY_RESULT) as number) / 1e6;
          gpuN++;
        }
        ctx.deleteQuery(p.q);
        pending.shift();
      }
      while (pending.length > 16) ctx.deleteQuery(pending.shift()!.q);
    }
    if (now - winStart < WINDOW_MS) return;

    const secs = (now - winStart) / 1000;
    const fps = winFrames / secs;
    const info = gl.info;
    while (longTasks.length && now - longTasks[0].at > LONG_TASK_KEEP_MS) longTasks.shift();
    let longMax = 0;
    for (const t of longTasks) if (t.ms > longMax) longMax = t.ms;
    if (windows++ % SCENE_EVERY === 0) {
      let vis = 0;
      let all = 0;
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) all++;
      });
      scene.traverseVisible((o) => {
        if ((o as THREE.Mesh).isMesh) vis++;
      });
      meshes = `${vis} visible / ${all}`;
    }
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const st = useStore.getState();
    const lines = [
      `fps ${fps.toFixed(1).padStart(5)}   cpu ${winFrames ? (cpuSum / winFrames).toFixed(1) : '-'} / ${winFrames ? cpuMax.toFixed(1) : '-'} ms (avg / max)   gpu ${gpuN ? (gpuSum / gpuN).toFixed(1) + ' ms' : ext ? '…' : 'n/a'}`,
      `draw ${info.render.calls}   tri ${(info.render.triangles / 1000).toFixed(1)}k   pts ${info.render.points}`,
      `geo ${info.memory.geometries}   tex ${info.memory.textures}   prog ${info.programs?.length ?? '?'}`,
      `dpr ${gl.getPixelRatio().toFixed(2)}   ${gl.domElement.width}×${gl.domElement.height}   quality ${st.quality}`,
      `rooms ${frame.mountedRooms.size} mounted · ${frame.readyRooms.size} ready · ${frame.visibleRooms.size} visible   ${frame.busy ? 'busy' : 'idle'}${frame.building > 0 ? ' · building' : ''}`,
      `meshes ${meshes}   long tasks ${longTasks.length} (max ${Math.round(longMax)} ms, ${LONG_TASK_KEEP_MS / 1000} s)`,
      heap === undefined ? '' : `heap ${(heap / 1048576).toFixed(0)} MB`,
    ];
    el.textContent = lines.filter(Boolean).join('\n');
    winStart = now;
    winFrames = 0;
    cpuSum = 0;
    cpuMax = 0;
    gpuSum = 0;
    gpuN = 0;
  });

  return () => {
    stopBefore();
    stopAfter();
    observer?.disconnect();
    if (ext) {
      if (active) {
        ctx.endQuery(ext.TIME_ELAPSED_EXT);
        ctx.deleteQuery(active);
      }
      for (const p of pending) ctx.deleteQuery(p.q);
    }
    el.remove();
  };
}
