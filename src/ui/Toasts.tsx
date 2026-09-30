import { useToasts } from '../toast';
import { Icon } from './Icon';

/** Small cards in the bottom-right corner: achievements, "photo saved"... They are also read out to screen readers. */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-ico"><Icon name={t.icon} size={20} /></span>
          <span className="toast-body">
            <b>{t.title}</b>
            {t.text ? <small>{t.text}</small> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
