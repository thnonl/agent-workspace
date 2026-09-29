// Run with:  npm test   (node --test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-office-'));
  const project = path.join(root, 'E--demo');
  fs.mkdirSync(project, { recursive: true });
  const sid = '11111111-2222-3333-4444-555555555555';
  const file = path.join(project, `${sid}.jsonl`);
  const events = [];
  const monitor = createMonitor({ claudeDir: root, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  const write = (obj) => fs.appendFileSync(file, `${JSON.stringify(obj)}\n`);
  const base = { cwd: 'E:\\demo', sessionId: sid, isSidechain: false };
  return { root, project, sid, file, events, monitor, write, base };
}

const assistant = (base, content, stop = null) => ({ ...base, type: 'assistant', message: { role: 'assistant', content, stop_reason: stop } });
const user = (base, content, extra = {}) => ({ ...base, type: 'user', message: { role: 'user', content }, ...extra });

test('main agent turn, sync sub-agent and async sub-agent', async () => {
  const { root, project, sid, events, monitor, write, base } = setup();
  monitor.start();
  write(user(base, 'Build me a landing page'));
  await sleep(200);
  write(assistant(base, [{ type: 'thinking', thinking: 'Plan first.' }]));
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_sync', name: 'Agent', input: { description: 'Explore repo', subagent_type: 'Explore' } }], 'tool_use'));
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_async', name: 'Agent', input: { description: 'Write copy', subagent_type: 'general-purpose' } }], 'tool_use'));
  await sleep(200);

  // the sub-agent transcripts live next to the session file
  const subDir = path.join(project, sid, 'subagents');
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(subDir, 'agent-aaa.meta.json'), JSON.stringify({ toolUseId: 'toolu_sync', description: 'Explore repo' }));
  fs.writeFileSync(path.join(subDir, 'agent-aaa.jsonl'), `${JSON.stringify(assistant({ ...base, isSidechain: true }, [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'C:\\x\\index.html' } }], 'tool_use'))}\n`);
  await sleep(200);

  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_sync', content: [{ type: 'text', text: 'Found index.html' }] }], { toolUseResult: { status: 'completed' } }));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_async', content: [{ type: 'text', text: 'Async agent launched successfully.' }] }], { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'aaa2' } }));
  await sleep(200);
  write(user(base, '<task-notification>\n<task-id>aaa2</task-id>\n<tool-use-id>toolu_async</tool-use-id>\n<status>completed</status>\n<result>Copy written.</result>\n</task-notification>'));
  write(assistant(base, [{ type: 'text', text: 'All done.' }], 'end_turn'));
  await sleep(300);
  monitor.stop();

  const types = events.map((e) => `${e.type}:${e.agentId ?? ''}${e.kind ? `:${e.kind}` : ''}`);
  assert.ok(types.includes('session:'));
  assert.ok(types.includes('agent_start:main'), 'director enters');
  assert.ok(types.includes('agent_say:main:task'), 'user prompt becomes a task note');
  assert.ok(types.includes('agent_start:toolu_sync'), 'sync sub-agent spawned');
  assert.ok(types.includes('agent_start:toolu_async'), 'async sub-agent spawned');
  assert.ok(types.includes('agent_say:toolu_sync:tool'), 'sub-agent transcript is followed');
  const doneSync = events.find((e) => e.type === 'agent_done' && e.agentId === 'toolu_sync');
  assert.equal(doneSync?.summary, 'Found index.html');
  const doneAsync = events.find((e) => e.type === 'agent_done' && e.agentId === 'toolu_async');
  assert.equal(doneAsync?.summary, 'Copy written.', 'async agent only finishes on its notification');
  assert.ok(types.indexOf('agent_done:toolu_async') > types.indexOf('agent_start:toolu_async'));
  assert.ok(types.includes('agent_done:main'), 'end_turn releases the director');
  const session = events.find((e) => e.type === 'session');
  assert.equal(session.project, 'demo');
  fs.rmSync(root, { recursive: true, force: true });
});

test('project is the launch dir, not the latest cwd', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-office-'));
  const launch = path.join(root, 'my-proj');
  const deep = path.join(launch, 'src', 'deep');
  const dir = path.join(root, launch.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const sid = '99999999-2222-3333-4444-555555555555';
  const file = path.join(dir, `${sid}.jsonl`);
  const events = [];
  const monitor = createMonitor({ claudeDir: root, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  const write = (obj) => fs.appendFileSync(file, `${JSON.stringify(obj)}\n`);
  monitor.start();
  write(user({ cwd: launch, sessionId: sid, isSidechain: false }, 'hello'));
  await sleep(200);
  write(assistant({ cwd: deep, sessionId: sid, isSidechain: false }, [{ type: 'text', text: 'hi' }], 'end_turn'));
  await sleep(300);
  monitor.stop();
  const sessions = events.filter((e) => e.type === 'session');
  assert.ok(sessions.length > 0);
  for (const s of sessions) {
    assert.equal(s.project, 'my-proj');
    assert.equal(s.cwd, launch);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('late joiners get a snapshot with unfinished agents only', async () => {
  const { root, sid, monitor, write, base } = setup();
  write(user(base, 'Long job'));
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_run', name: 'Agent', input: { description: 'Still running' } }], 'tool_use'));
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_fin', name: 'Agent', input: { description: 'Already done' } }], 'tool_use'));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_fin', content: 'ok' }], { toolUseResult: { status: 'completed' } }));
  monitor.start();
  await sleep(150);
  const snap = monitor.snapshot();
  monitor.stop();
  const started = snap.filter((e) => e.type === 'agent_start').map((e) => e.agentId);
  assert.deepEqual(started.sort(), ['main', 'toolu_run']);
  assert.equal(snap[0].sessionId, sid);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the main agent final message travels in full, line breaks kept', async () => {
  const { root, events, monitor, write, base } = setup();
  monitor.start();
  write(user(base, 'Summarise the work'));
  await sleep(150);
  const final = '## Done\n\n- one\n- two\n\nAll good.';
  write(assistant(base, [{ type: 'text', text: final }], 'end_turn'));
  await sleep(300);
  monitor.stop();
  const say = events.filter((e) => e.type === 'agent_say' && e.agentId === 'main' && e.kind === 'text').pop();
  assert.ok(say, 'text event emitted');
  assert.equal(say.full, final);
  assert.ok(!say.text.includes('\n'), 'the bubble text is a single line');
  fs.rmSync(root, { recursive: true, force: true });
});

test('an idle session still knows what was asked and how it ended', async () => {
  const { root, monitor, write, base } = setup();
  write(user(base, 'Please tidy the imports'));
  write(assistant(base, [{ type: 'text', text: 'Imports are tidy.\n\n- sorted\n- deduplicated' }], 'end_turn'));
  monitor.start();
  await sleep(200);
  const session = monitor.snapshot().find((e) => e.type === 'session');
  monitor.stop();
  assert.ok(session, 'the session is announced');
  assert.equal(session.lastPrompt, 'Please tidy the imports');
  assert.equal(session.lastFinal, 'Imports are tidy.\n\n- sorted\n- deduplicated');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a session that has been quiet for a while still wakes up when its transcript grows', async () => {
  const { root, events, monitor, write, base } = setup();
  write(user(base, 'Old question'));
  write(assistant(base, [{ type: 'text', text: 'Old answer.' }], 'end_turn'));
  // make the transcript look old so the session is polled slowly (hot window = 40 poll intervals = 1.2 s here)
  const past = new Date(Date.now() - 20_000);
  fs.utimesSync(path.join(root, 'E--demo', '11111111-2222-3333-4444-555555555555.jsonl'), past, past);
  monitor.start();
  await sleep(200);
  events.length = 0;
  write(user(base, 'A brand new question'));
  await sleep(400);
  monitor.stop();
  assert.ok(events.some((e) => e.type === 'agent_say' && e.kind === 'task'), 'the new prompt is picked up quickly');
  fs.rmSync(root, { recursive: true, force: true });
});
