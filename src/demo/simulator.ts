import type { MonitorEvent, SpeechKind } from '../types';

/**
 * Scripted "fake Claude sessions" so the office can be enjoyed without a running Claude Code.
 * It emits exactly the same events the transcript monitor produces.
 */
type Emit = (ev: MonitorEvent) => void;

interface Line {
  kind: SpeechKind;
  text: string;
  tool?: string;
}

interface AgentScript {
  label: string;
  type: string;
  lines: Line[];
  summary: string;
  fail?: boolean;
}

interface Scenario {
  prompt: string;
  opening: Line[];
  agents: AgentScript[];
  outro: Line[];
}

const T = (text: string): Line => ({ kind: 'thinking', text });
const S = (text: string): Line => ({ kind: 'text', text });
const R = (file: string): Line => ({ kind: 'tool', tool: 'Read', text: `Reading ${file}` });
const E = (file: string): Line => ({ kind: 'tool', tool: 'Edit', text: `Editing ${file}` });
const W = (file: string): Line => ({ kind: 'tool', tool: 'Write', text: `Writing ${file}` });
const B = (cmd: string): Line => ({ kind: 'tool', tool: 'Bash', text: `$ ${cmd}` });
const G = (pat: string): Line => ({ kind: 'tool', tool: 'Grep', text: `Searching “${pat}”` });

const SCENARIOS: Scenario[] = [
  {
    prompt: 'Refactor the auth module to use JWT and add refresh tokens',
    opening: [T('Let me see how authentication works today before touching anything.'), G('session'), R('src/auth/middleware.ts'), S('Sessions are cookie based. I will split the work into four parts.')],
    agents: [
      { label: 'Map auth flow', type: 'Explore', lines: [G('req.session'), R('src/auth/login.ts'), R('src/routes/index.ts'), T('Three entry points read the session. One writes it.')], summary: 'Found 3 readers and 1 writer of req.session. Notes in docs/auth-map.md.' },
      { label: 'Implement JWT signing', type: 'general-purpose', lines: [W('src/auth/jwt.ts'), T('Use short lived access tokens and rotate refresh tokens.'), E('src/auth/login.ts'), B('npm test -- jwt')], summary: 'jwt.ts added, login issues access + refresh tokens. 12 tests pass.' },
      { label: 'Refresh token endpoint', type: 'general-purpose', lines: [R('src/routes/auth.ts'), W('src/routes/refresh.ts'), T('Need to invalidate the old refresh token on use.'), E('src/db/tokens.ts')], summary: 'POST /auth/refresh implemented with rotation and reuse detection.' },
      { label: 'Update tests', type: 'general-purpose', lines: [G('describe\\('), E('tests/auth.test.ts'), B('npm test'), T('One flaky test depends on the clock, freezing time.'), E('tests/helpers/clock.ts')], summary: 'Tests migrated. Suite green: 48 passed, 0 failed.' },
    ],
    outro: [S('All four parts are merged. Auth now uses JWT with refresh rotation.')],
  },
  {
    prompt: 'The checkout page is slow on mobile, find out why',
    opening: [T('Performance problem. Start with measuring, not guessing.'), B('npx lighthouse http://localhost:3000/checkout'), S('LCP is 4.8s. Let me get two people to dig in.')],
    agents: [
      { label: 'Profile bundle size', type: 'Explore', lines: [B('npx vite-bundle-visualizer'), T('moment.js is pulled in twice.'), G('from \'moment\''), R('vite.config.ts')], summary: 'moment.js and lodash are bundled fully: 310 KB avoidable.' },
      { label: 'Audit network waterfall', type: 'general-purpose', lines: [B('curl -w "%{time_total}" /api/cart'), T('Cart and shipping are fetched serially.'), R('src/checkout/Checkout.tsx'), E('src/checkout/Checkout.tsx')], summary: 'Parallelised cart + shipping requests: saves ~700 ms.' },
      { label: 'Lazy-load payment SDK', type: 'general-purpose', lines: [R('src/checkout/Payment.tsx'), T('The SDK is only needed after the user clicks Pay.'), E('src/checkout/Payment.tsx'), B('npm run build')], summary: 'Payment SDK loaded on demand. Initial JS down by 120 KB.' },
    ],
    outro: [S('Checkout LCP dropped from 4.8s to 2.1s. Summary written to PERF.md.')],
  },
  {
    prompt: 'Write the launch blog post and update the docs site',
    opening: [T('Two deliverables: a post and docs. I can parallelise.'), R('CHANGELOG.md'), S('Handing out the drafting work now.')],
    agents: [
      { label: 'Draft blog post', type: 'general-purpose', lines: [R('CHANGELOG.md'), W('blog/launch.md'), T('Lead with the user benefit, not the feature list.'), E('blog/launch.md')], summary: 'Draft ready: 780 words, three screenshots placeholders.' },
      { label: 'Update API reference', type: 'general-purpose', lines: [G('@deprecated'), E('docs/api/users.md'), E('docs/api/orders.md'), B('npm run docs:build')], summary: 'API reference regenerated, 2 deprecated endpoints marked.' },
      { label: 'Check dead links', type: 'Explore', lines: [B('npx linkinator docs/ --recurse'), T('Six links point to the old domain.'), G('old-domain.com')], summary: 'Fixed 6 dead links, docs site builds clean.' },
    ],
    outro: [S('Post and docs are ready for review.')],
  },
  {
    prompt: 'Add dark mode toggle with system preference support',
    opening: [T('Check how colors are defined first.'), G('--color-'), R('src/styles/tokens.css'), S('Tokens are centralised, so this is easy.')],
    agents: [
      { label: 'Theme tokens', type: 'general-purpose', lines: [E('src/styles/tokens.css'), T('Use prefers-color-scheme as the default.'), W('src/theme/useTheme.ts')], summary: 'Dark tokens + useTheme hook with localStorage override.' },
      { label: 'Toggle component', type: 'general-purpose', lines: [W('src/components/ThemeToggle.tsx'), E('src/components/Header.tsx'), B('npm run lint')], summary: 'ThemeToggle in header, keyboard accessible.' },
    ],
    outro: [S('Dark mode works and follows the OS setting by default.')],
  },
];

const PROJECTS = [
  { id: 'demo-pixel-shop', project: 'pixel-shop', cwd: '/home/dev/pixel-shop' },
  { id: 'demo-api-gateway', project: 'api-gateway', cwd: '/home/dev/api-gateway' },
  { id: 'demo-docs-site', project: 'docs-site', cwd: '/home/dev/docs-site' },
];

export function startDemo(emit: Emit, count = 3): () => void {
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const wakers = new Set<() => void>();

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        timers.delete(t);
        resolve();
      }, ms);
      timers.add(t);
    });
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

  async function runAgent(sessionId: string, id: string, script: AgentScript) {
    emit({ type: 'agent_start', sessionId, agentId: id, role: 'sub', label: script.label, agentType: script.type });
    await sleep(rnd(2800, 4200)); // walking in + unpacking
    for (const l of script.lines) {
      if (stopped) return;
      emit({ type: 'agent_say', sessionId, agentId: id, kind: l.kind, text: l.text, tool: l.tool });
      await sleep(rnd(3200, 5200));
    }
    if (stopped) return;
    emit({ type: 'agent_done', sessionId, agentId: id, summary: script.summary, failed: script.fail });
  }

  async function runSession(idx: number) {
    const p = PROJECTS[idx % PROJECTS.length];
    let run = idx;
    await sleep(idx * 6500 + 300);
    emit({ type: 'session', sessionId: p.id, title: '', cwd: p.cwd, project: p.project, updatedAt: Date.now() });
    while (!stopped) {
      const sc = SCENARIOS[run++ % SCENARIOS.length];
      const title = sc.prompt.length > 46 ? `${sc.prompt.slice(0, 45)}…` : sc.prompt;
      emit({ type: 'session', sessionId: p.id, title, cwd: p.cwd, project: p.project, updatedAt: Date.now() });
      emit({ type: 'agent_start', sessionId: p.id, agentId: 'main', role: 'main', label: 'Director' });
      emit({ type: 'agent_say', sessionId: p.id, agentId: 'main', kind: 'task', text: sc.prompt });
      await sleep(5200);
      for (const l of sc.opening) {
        if (stopped) return;
        emit({ type: 'agent_say', sessionId: p.id, agentId: 'main', kind: l.kind, text: l.text, tool: l.tool });
        await sleep(rnd(3000, 4200));
      }
      // hand out the work, one by one
      const running: Promise<void>[] = [];
      for (let i = 0; i < sc.agents.length; i++) {
        if (stopped) return;
        const a = sc.agents[i];
        const id = `${p.id}-${run}-${i}`;
        emit({ type: 'agent_say', sessionId: p.id, agentId: 'main', kind: 'tool', tool: 'Agent', text: `Delegating: ${a.label}` });
        running.push(runAgent(p.id, id, { ...a, fail: Math.random() < 0.07 }));
        await sleep(rnd(1800, 3200));
      }
      // director keeps busy while the team works
      let waiting = true;
      Promise.all(running).then(() => (waiting = false));
      const chatter: Line[] = [T('Waiting for the team to report back…'), G('TODO'), R('README.md'), T('Reviewing what comes in.')];
      let ci = 0;
      while (waiting && !stopped) {
        await sleep(rnd(4200, 6500));
        if (!waiting || stopped) break;
        const l = chatter[ci++ % chatter.length];
        emit({ type: 'agent_say', sessionId: p.id, agentId: 'main', kind: l.kind, text: l.text, tool: l.tool });
      }
      await sleep(1800);
      for (const l of sc.outro) {
        if (stopped) return;
        emit({ type: 'agent_say', sessionId: p.id, agentId: 'main', kind: l.kind, text: l.text });
        await sleep(3400);
      }
      emit({ type: 'agent_done', sessionId: p.id, agentId: 'main' });
      await sleep(rnd(14000, 26000));
    }
  }

  for (let i = 0; i < count; i++) void runSession(i);

  return () => {
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    wakers.forEach((w) => w());
    void pick;
  };
}
