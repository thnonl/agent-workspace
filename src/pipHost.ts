/**
 * Which window the office is shown in. Normally the page itself; in picture-in-picture mode (see pip.ts) the whole app lives in a small
 * floating window, while the page it came from may be hidden behind other windows – and a hidden page gets no animation frames and
 * slow timers. Everything that paces itself (frames, rain, the office clock) asks `host()` for the window whose clock to use.
 * No imports on purpose: audio, music and the scene need it, and pip.ts needs the store, which needs audio.
 */
let floating: Window | null = null;

export const setFloatingWindow = (w: Window | null) => {
  floating = w;
};
/** the floating window while it is open, else null */
export const floatingWindow = () => floating;
/** the window that shows the office right now */
export const host = (): Window => floating ?? window;
/** is somebody looking at the office? A hidden page is not – unless its office is in the floating window. */
export const pageActive = () => !!floating || (typeof document !== 'undefined' && !document.hidden);
