import type { Provider } from '../types';

export const PROVIDERS: Provider[] = ['claude', 'codex', 'opencode'];

/** The sources the monitor reports as watched (switched-off ones are null), in a fixed order. */
export function watchedSources(sources: Record<string, string | null>): { provider: Provider; path: string }[] {
  return PROVIDERS.flatMap((provider) => (sources[provider] ? [{ provider, path: sources[provider] as string }] : []));
}

export const PROVIDER_NAME: Record<Provider, string> = { claude: 'Claude Code', codex: 'Codex / ChatGPT', opencode: 'OpenCode' };

/** Round provider badge (simplified marks). It has a fixed size and never shrinks, whatever the text next to it does. */
export function ProviderLogo({ provider, size = 34 }: { provider: Provider; size?: number }) {
  return (
    <svg className="provider-logo" viewBox="0 0 32 32" width={size} height={size} role="img" aria-label={PROVIDER_NAME[provider]}>
      <title>{PROVIDER_NAME[provider]}</title>
      {provider === 'claude' ? (
        <>
          <circle cx="16" cy="16" r="16" fill="#d97757" />
          <g stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
            {Array.from({ length: 10 }, (_, k) => {
              const a = (k * 36 - 90) * (Math.PI / 180);
              const r2 = k % 2 ? 9 : 11.5;
              return <line key={k} x1={16 + Math.cos(a) * 2.5} y1={16 + Math.sin(a) * 2.5} x2={16 + Math.cos(a) * r2} y2={16 + Math.sin(a) * r2} />;
            })}
          </g>
        </>
      ) : provider === 'codex' ? (
        <>
          <circle cx="16" cy="16" r="16" fill="#10a37f" />
          <g transform="translate(16 16)" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round">
            {Array.from({ length: 6 }, (_, k) => (
              <rect key={k} x="-3.6" y="-11.2" width="7.2" height="14" rx="3.6" transform={`rotate(${k * 60})`} />
            ))}
          </g>
        </>
      ) : (
        <>
          <circle cx="16" cy="16" r="16" fill="#211e1e" />
          <rect x="10" y="7" width="12" height="18" fill="#f1ecec" />
          <rect x="13" y="13" width="6" height="6" fill="#5a5454" />
        </>
      )}
    </svg>
  );
}
