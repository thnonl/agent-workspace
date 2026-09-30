// A background agent that is stopped from outside (e.g. the machine was restarted) must not stay "running" in the office.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-office-notify-'));
  const project = path.join(root, 'E--demo');
  fs.mkdirSync(project, { recursive: true });
  const sid = '88888888-2222-3333-4444-555555555555';
  const file = path.join(project, `${sid}.jsonl`);
  const events = [];
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  const write = (obj) => fs.appendFileSync(file, `${JSON.stringify(obj)}\n`);
  const base = { cwd: 'E:\demo', sessionId: sid, isSidechain: false };
  return { root, events, monitor, write, base };
}
const assistant = (base, content) => ({ ...base, type: 'assistant', message: { role: 'assistant', content, stop_reason: 'tool_use' } });
const user = (base, content, extra = {}) => ({ ...base, type: 'user', message: { role: 'user', content }, ...extra });

async function launch(ctx) {
  const { monitor, write, base } = ctx;
  monitor.start();
  write(user(base, 'Run the QA'));
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_qa', name: 'Agent', input: { description: 'QA hands vs desk', subagent_type: 'general-purpose', run_in_background: true } }]));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_qa', content: 'Async agent launched successfully.' }], { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'a7b9ca8f608d4a6cb' } }));
  await sleep(250);
}

test('a "stopped" notice that only names the task id in its text ends the agent as failed', async () => {
  const ctx = setup();
  await launch(ctx);
  assert.equal(ctx.events.filter((e) => e.type === 'agent_start' && e.agentId === 'toolu_qa').length, 1);
  ctx.write(user(ctx.base, '<task-notification>\n<status>stopped</status>\n<summary>The container running this session was restarted before background work reported back: "QA hands vs desk" (task a7b9ca8f608d4a6cb)</summary>\n</task-notification>'));
  await sleep(250);
  const done = ctx.events.filter((e) => e.type === 'agent_done' && e.agentId === 'toolu_qa');
  assert.equal(done.length, 1);
  assert.equal(done[0].failed, true);
  assert.ok(!ctx.monitor.snapshot().some((e) => e.type === 'agent_start' && e.agentId === 'toolu_qa'), 'no longer running for late joiners');
  ctx.monitor.stop();
  fs.rmSync(ctx.root, { recursive: true, force: true });
});

test('a notice with a <task-id> (the background agent id) ends the agent, completed ones are not failed', async () => {
  const ctx = setup();
  await launch(ctx);
  ctx.write(user(ctx.base, '<task-notification>\n<task-id>a7b9ca8f608d4a6cb</task-id>\n<status>completed</status>\n<result>All good</result>\n</task-notification>'));
  await sleep(250);
  const done = ctx.events.filter((e) => e.type === 'agent_done' && e.agentId === 'toolu_qa');
  assert.equal(done.length, 1);
  assert.equal(done[0].failed, false);
  ctx.monitor.stop();
  fs.rmSync(ctx.root, { recursive: true, force: true });
});

test('a hot session with old sub-agent files keeps polling without errors (and still follows a new main line)', async () => {
  const ctx = setup();
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.map(String).join(' '));
  try {
    const { root, monitor, write, base, events } = ctx;
    const dir = path.join(root, 'E--demo', '88888888-2222-3333-4444-555555555555', 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    const old = new Date(Date.now() - 60 * 60_000);
    for (let i = 0; i < 5; i++) {
      const f = path.join(dir, `agent-old${i}.jsonl`);
      fs.writeFileSync(f, `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'x' } })}\n`);
      fs.writeFileSync(path.join(dir, `agent-old${i}.meta.json`), JSON.stringify({ toolUseId: `toolu_old${i}`, description: 'old' }));
      fs.utimesSync(f, old, old);
    }
    monitor.start();
    write(user(base, 'Do the job'));
    await sleep(200);
    for (let i = 0; i < 6; i++) {
      write(assistant(base, [{ type: 'text', text: `step ${i}` }]));
      await sleep(120);
    }
    assert.deepEqual(errors.filter((e) => e.includes('[monitor]')), []);
    assert.ok(events.some((e) => e.type === 'agent_say' && /step 5/.test(e.text ?? '')), 'the last main line was still delivered');
    assert.equal(events.filter((e) => e.type === 'agent_start' && /^toolu_old/.test(e.agentId)).length, 0, 'old agents are not adopted');
    monitor.stop();
    fs.rmSync(root, { recursive: true, force: true });
  } finally {
    console.error = orig;
  }
});
