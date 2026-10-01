import { useStore } from './store';
import { pushToast } from './toast';
import { floatingWindow, setFloatingWindow } from './pipHost';

/**
 * Picture-in-picture mode: the whole office moves into a small always-on-top window (the browser's Document Picture-in-Picture
 * API: Chrome and Edge 116+, on https or localhost). It looks like the screensaver – no buttons – but the camera holds still, it
 * stays in the room that was on screen and has no photo button. Close the window (or press I) to bring the office back.
 */
interface DocumentPip {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}
const api = (): DocumentPip | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture);

export const pipSupported = () => !!api();

let restore: (() => void) | null = null;

/** Opens the floating window and moves the office into it. Must be called from a click or key press. */
export async function enterPip(): Promise<boolean> {
  const dp = api();
  const app = document.querySelector<HTMLElement>('.app');
  const home = app?.parentElement;
  if (!dp || !app || !home || floatingWindow()) return false;
  let w: Window;
  try {
    w = await dp.requestWindow({ width: 480, height: 300 });
  } catch {
    pushToast({ icon: 'info', title: 'Could not open the floating window', text: 'The browser only allows it after a click or key press.' });
    return false;
  }

  // the same look: every stylesheet of the page, with the page's address as the base for relative URLs
  const base = w.document.createElement('base');
  base.href = document.baseURI;
  w.document.head.appendChild(base);
  for (const n of Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))) w.document.head.appendChild(n.cloneNode(true));
  w.document.documentElement.style.cssText = 'height:100%';
  w.document.body.style.cssText = 'margin:0;height:100%;overflow:hidden';

  // what the page shows meanwhile
  const note = document.createElement('div');
  note.className = 'pip-placeholder';
  const text = document.createElement('p');
  text.textContent = 'The office is in the floating window.';
  const back = document.createElement('button');
  back.className = 'btn btn-big';
  back.textContent = 'Bring it back';
  back.onclick = () => w.close();
  note.append(text, back);

  const title = () => {
    const s = useStore.getState();
    const room = s.activeRoomId ? s.rooms[s.activeRoomId] : null;
    w.document.title = room ? `${room.project} · Agent Workspace` : 'Agent Workspace';
  };
  title();
  const unsub = useStore.subscribe(title);

  const leave = () => {
    unsub();
    w.removeEventListener('pagehide', leave);
    restore = null;
    setFloatingWindow(null);
    note.remove();
    home.appendChild(app); // (back into the page, where React still owns it)
    useStore.getState().setPip(false);
    window.dispatchEvent(new Event('resize')); // (the canvas measures itself again)
  };
  restore = () => w.close();
  w.addEventListener('pagehide', leave);

  setFloatingWindow(w);
  home.appendChild(note);
  w.document.body.appendChild(app);
  useStore.getState().setPip(true);
  return true;
}

export function exitPip() {
  restore?.();
}

export function togglePip() {
  if (floatingWindow()) exitPip();
  else void enterPip();
}
