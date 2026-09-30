import { useStore } from '../store';
import type { MonitorEvent } from '../types';

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

  const open = () => {
    if (closed) return;
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
      // EventSource reconnects on its own; when the server is gone for good it keeps retrying quietly
    };
  };

  store.setConnection('connecting');
  open();
  return () => {
    closed = true;
    es?.close();
    flush();
  };
}
