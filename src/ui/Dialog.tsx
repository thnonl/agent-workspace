import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  /** class of the full-screen backdrop */
  backdrop: string;
  /** class of the dialog itself */
  card: string;
  label: string;
  role?: 'dialog' | 'alertdialog';
  as?: 'div' | 'article';
  onClose: () => void;
  children: ReactNode;
}

/**
 * A modal dialog: it takes the focus when it opens (an element with `data-autofocus`, else the first control), keeps Tab
 * inside, gives the focus back when it closes, and closes on a click beside the card – but not when a drag that started in
 * the card (selecting text) happens to end on the backdrop. (Esc is handled by the global hotkeys.)
 */
export function Dialog({ backdrop, card, label, role = 'dialog', as: Card = 'div', onClose, children }: DialogProps) {
  const cardRef = useRef<HTMLElement>(null);
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = cardRef.current;
    if (el) (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus({ preventScroll: true });
    return () => {
      if (before && before.isConnected && before !== document.body) before.focus({ preventScroll: true });
    };
  }, []);

  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const el = cardRef.current;
    if (!el) return;
    const list = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!list.length) {
      e.preventDefault();
      el.focus();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === el)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (!el.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={backdrop}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <Card ref={cardRef as never} className={card} role={role} aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={trap}>
        {children}
      </Card>
    </div>
  );
}
