import { useStore } from '../store';
import type { MonitorEvent } from '../types';

/** Subscribes to the transcript monitor (Server-Sent Events) and feeds the store. */
export function connectLive(): () => void {
  const store = useStore.getState();
  let es: EventSource | null = null;
  let closed = false;

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
      const s = useStore.getState();
      if (ev.type === 'hello') {
        s.beginSync();
        s.setConnection('live', ev.sources ?? { claude: ev.claudeDir });
      }
      s.applyEvent(ev, false);
      if (ev.type === 'ready') s.endSync();
    };
    es.onerror = () => {
      useStore.getState().setConnection('offline');
      // EventSource reconnects on its own; when the server is gone for good it keeps retrying quietly
    };
  };

  store.setConnection('connecting');
  open();
  return () => {
    closed = true;
    es?.close();
  };
}
