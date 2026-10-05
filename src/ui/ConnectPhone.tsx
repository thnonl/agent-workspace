import { useEffect, useMemo, useState } from 'react';
import { renderSVG } from 'uqr';
import { Icon } from './Icon';

interface ConnectInfo {
  port: number;
  bound: string;
  addresses: { address: string; name: string }[];
  apkUrl: string;
  releasesUrl: string;
}

/** What the Android app (android/, MainActivity.AppBridge) adds to the page; missing in a browser and in app versions before it. */
interface AppBridge {
  /** leaves the office and shows the app's connect form */
  changeServer(): void;
  version(): string;
}

declare global {
  interface Window {
    AgentWorkspaceApp?: AppBridge;
  }
}

export const appBridge = (): AppBridge | undefined => (typeof window === 'undefined' ? undefined : window.AgentWorkspaceApp);

/** The page runs on a phone: in the Android app (its user agent carries `AgentWorkspaceApp/<version>`) or a mobile browser. */
export const onPhone = typeof navigator !== 'undefined' && /AgentWorkspaceApp|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/**
 * Settings → Connect a device: the address phones and other computers on the network can use, and a QR code. The QR code opens the
 * server's /m page, which starts the Android app (or downloads it from the latest GitHub release); the app's own scanner reads the
 * address straight from it.
 */
export function ConnectPhone() {
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState(0);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    fetch('/api/connect', { signal: ctl.signal, cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<ConnectInfo>) : Promise.reject(new Error(String(r.status)))))
      .then(setInfo, () => {
        if (!ctl.signal.aborted) setFailed(true);
      });
    return () => ctl.abort();
  }, []);

  const address = info?.addresses[Math.min(pick, info.addresses.length - 1)]?.address;
  const link = info && address ? `http://${address}:${info.port}/m` : '';
  const svg = useMemo(() => (showQr && link ? renderSVG(link, { border: 2, whiteColor: '#ffffff', blackColor: '#1d1b2e' }) : ''), [showQr, link]);

  if (failed) return <p className="muted">The server did not answer – connecting a device needs <code>npm start</code> or <code>npx @thnonline/agent-workspace</code>.</p>;
  if (!info) return <p className="muted">Looking up the address…</p>;
  if (!address)
    return (
      <p className="muted">
        The server only listens on this computer. Start it with <code>--host 0.0.0.0</code> (for example <code>npx @thnonline/agent-workspace@latest --host 0.0.0.0</code>) so phones and other computers on the same Wi-Fi can reach it.
      </p>
    );
  return (
    <>
      <div className="connect-grid">
        <span>Address</span>
        {info.addresses.length > 1 ? (
          <select value={pick} onChange={(e) => setPick(Number(e.target.value))} aria-label="Network address">
            {info.addresses.map((a, i) => (
              <option key={a.address} value={i}>
                {a.address}:{info.port}{a.name ? ` (${a.name})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <code>{address}:{info.port}</code>
        )}
        <span>IP</span>
        <code>{address}</code>
        <span>Port</span>
        <code>{info.port}</code>
      </div>
      <div className="set-row">
        <button type="button" className={`btn${showQr ? ' btn-on' : ''}`} aria-pressed={showQr} onClick={() => setShowQr(!showQr)}>
          <Icon name="qr" size={16} /> {showQr ? 'Hide' : 'Show'} QR code
        </button>
        <a className="btn" href={info.apkUrl} target="_blank" rel="noreferrer">
          <Icon name="download" size={16} /> Android app (APK)
        </a>
      </div>
      {showQr ? <div className="connect-qr" role="img" aria-label={`QR code for ${link}`} dangerouslySetInnerHTML={{ __html: svg }} /> : null}
      <p className="muted">
        On a phone, scan the code with the camera or with the Agent Workspace app. With the app installed it connects right away; without it, the phone downloads the newest app from GitHub. On another computer, open the address in a browser. The device must be on the same network, and the firewall must let port {info.port} through. Anyone who can reach this address can watch your sessions.
      </p>
    </>
  );
}
