import { useStore } from '../store';
import type { MonitorEvent } from '../types';

/** Opens the stream again right now (set while the page is connected; the button on the offline screen calls it). */
let reopen: (() => void) | null = null;
export const retryConnection = () => reopen?.();

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

  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    if (closed) return;
    clearTimeout(retryTimer);
    es?.close();
    es = new EventSource('/api/events');
    es.onopen = () => useStore.getState().setConnection('live');
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
      useStore.getState().setConnection('offline');
      // EventSource reconnects on its own after a dropped connection; after a failed one (server down, wrong status) it gives up, so try again from here
      if (es?.readyState === EventSource.CLOSED) retryTimer = setTimeout(open, 3000);
    };
  };
  reopen = () => {
    useStore.getState().setConnection('connecting');
    open();
  };

  store.setConnection('connecting');
  open();
  return () => {
    closed = true;
    reopen = null;
    clearTimeout(retryTimer);
    es?.close();
    flush();
  };
}
