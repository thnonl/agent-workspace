import { useEffect, useState } from 'react';
import { inAndroidApp, startUpdateCheck, useUpdate } from '../update';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="note-copy"
      aria-label={`Copy ${text}`}
      title="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        }, () => {});
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={14} />
    </button>
  );
}

/**
 * A new version is on npm: a sticky note with the steps to update. The steps are for the HOST – the computer that runs the
 * server – so the note says so in big letters, above all on a phone or another computer that only opens the page.
 */
export function UpdateNote() {
  const info = useUpdate((s) => s.info);
  const open = useUpdate((s) => s.open);
  const setOpen = useUpdate((s) => s.setOpen);

  useEffect(() => startUpdateCheck(), []);

  if (inAndroidApp || !open || !info?.newer || !info.latest) return null;
  const host = info.host || 'the host';
  // (the clipboard needs a secure context: http://<LAN address> has none; and on a client a copy is no use anyway)
  const canCopy = info.local && !!navigator.clipboard;
  const npmUrl = `https://www.npmjs.com/package/${info.name}?activeTab=versions`;

  return (
    <Dialog backdrop="note-backdrop" card="note" label={`Version ${info.latest} is out`} onClose={() => setOpen(false)}>
      <span className="note-pin" aria-hidden="true" />
      <button className="note-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
      <span className="note-kicker"><Icon name="download" size={13} /> Update available</span>
      <h2>v{info.latest} is out</h2>
      <p className="note-sub">This office runs v{info.current}.</p>

      <div className={`note-where${info.local ? ' is-host' : ''}`} role="note">
        <Icon name={info.local ? 'terminal' : 'alert'} size={18} />
        {info.local ? (
          <span><b>Run this on the host.</b> This computer <em>is</em> the host (<code>{host}</code>): use the terminal where Agent Workspace runs.</span>
        ) : (
          <span><b>Run this on the host, not here.</b> This device is only a client: typing the steps here does nothing. Go to the computer that runs Agent Workspace: <code>{host}</code>.</span>
        )}
      </div>

      <ol className="note-steps">
        <li>On <b>{host}</b>, stop Agent Workspace: <kbd>Ctrl</kbd>+<kbd>C</kbd> in its terminal.</li>
        {info.commands.map((cmd) => (
          <li key={cmd}>
            On <b>{host}</b>, run:
            <span className="note-cmd">
              <code>{cmd}</code>
              {canCopy ? <CopyButton text={cmd} /> : null}
            </span>
          </li>
        ))}
        <li>Reload this page{info.local ? '' : ' (and the page on every other device)'}.</li>
      </ol>
      {info.commands.some((c) => c.startsWith('npx ')) ? (
        <p className="note-tip">Keep the <code>@latest</code>: without it npx can start the old copy from its cache. Still the old version? Run <code>npx clear-npx-cache</code> on {host} first.</p>
      ) : null}

      <div className="note-foot">
        <a href={npmUrl} target="_blank" rel="noreferrer">What's new on npm</a>
        <button className="btn" onClick={() => setOpen(false)} data-autofocus>Got it</button>
      </div>
    </Dialog>
  );
}

/** Top bar button while an update waits: opens the note again. */
export function UpdateButton() {
  const info = useUpdate((s) => s.info);
  const setOpen = useUpdate((s) => s.setOpen);
  if (inAndroidApp || !info?.newer || !info.latest) return null;
  return (
    <button className="btn btn-update" onClick={() => setOpen(true)} aria-label={`Update available: v${info.latest}`} title={`v${info.latest} is on npm – how to update the host`}>
      <Icon name="download" size={18} />
      <span className="lbl" aria-hidden="true">v{info.latest}</span>
    </button>
  );
}
