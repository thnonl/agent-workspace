import { useStore } from '../store';
import type { MonitorEvent } from '../types';

/** Opens the stream again right now (set while the page is connected; the button on the offline screen calls it). */
let reopen: (() => void) | null = null;
export const retryConnection = () => reopen?.();

/** how long a page shown again waits for its new stream before it calls the monitor out of reach */
const RESUME_GRACE_MS = 6000;

/** Subscribes to the transcript monitor (Server-Sent Events) and feeds the store. */
export function connectLive(): () => void {
  const store = useStore.getState();
  let es: EventSource | null = null;
  let closed = false;

  // events are applied in one store update per frame; rAF is paused in hidden tabs, so a timeout flushes there too
  let queue: MonitorEvent[] = [];
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    raf = 0;
    timer = undefined;
    if (!queue.length) return;
    const list = queue;
    queue = [];
    useStore.getState().applyEvents(list);
  };
  const schedule = () => {
    if (raf || timer !== undefined) return;
    raf = requestAnimationFrame(flush);
    timer = setTimeout(flush, 100);
  };

  // A phone takes the network away from an app in the background (Android 15 and later, a few seconds after it is put
  // away), so the stream drops every time the app is. That is not the monitor going down, and "Offline" would close every
  // room (see offlineRoom in store.ts) for the office to fill up again on the way back. So a stream lost while the page is
  // hidden leaves the office as it was; a new stream is opened the moment the page is shown again, and the page only goes
  // "Offline" when that one does not get through either.
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let resuming = false;
  const open = () => {
    if (closed) return;
    clearTimeout(retryTimer);
    es?.close();
    es = new EventSource('/api/events');
    es.onopen = () => {
      resuming = false;
      clearTimeout(graceTimer);
      useStore.getState().setConnection('live');
    };
    es.onmessage = (m) => {
      let ev: MonitorEvent;
      try {
        ev = JSON.parse(m.data);
      } catch {
        return;
      }
      queue.push(ev);
      schedule();
    };
    es.onerror = () => {
      flush();
      if (!document.hidden && !resuming) useStore.getState().setConnection('offline');
      // EventSource reconnects on its own after a dropped connection; after a failed one (server down, wrong status) it gives up, so try again from here
      if (es?.readyState === EventSource.CLOSED) retryTimer = setTimeout(open, resuming ? 1000 : 3000);
    };
  };
  reopen = () => {
    useStore.getState().setConnection('connecting');
    open();
  };
  const onVisible = () => {
    if (document.hidden || es?.readyState === EventSource.OPEN) return;
    // (a new stream at once: the old one would wait out the browser's own back-off first)
    resuming = true;
    clearTimeout(graceTimer);
    graceTimer = setTimeout(() => {
      resuming = false;
      if (es?.readyState !== EventSource.OPEN) useStore.getState().setConnection('offline');
    }, RESUME_GRACE_MS);
    open();
  };
  document.addEventListener('visibilitychange', onVisible);

  store.setConnection('connecting');
  open();
  return () => {
    closed = true;
    reopen = null;
    document.removeEventListener('visibilitychange', onVisible);
    clearTimeout(graceTimer);
    clearTimeout(retryTimer);
    es?.close();
    flush();
  };
}
