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
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
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
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
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

test('Codex rollouts become a room: prompt, commentary, tools and the closing message', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-office-'));
  const dir = path.join(codexHome, 'sessions', '2026', '09', '30');
  fs.mkdirSync(dir, { recursive: true });
  const tid = '01a08f56-3f63-7090-bef6-652a7ee7d9e5';
  fs.writeFileSync(path.join(codexHome, 'session_index.jsonl'), `${JSON.stringify({ id: tid, thread_name: 'Redo the diagram' })}\n`);
  const file = path.join(dir, `rollout-2026-09-30T10-00-00-${tid}.jsonl`);
  const line = (type, payload) => fs.appendFileSync(file, `${JSON.stringify({ timestamp: new Date().toISOString(), type, payload })}\n`);
  const events = [];
  const monitor = createMonitor({ claudeDir: path.join(codexHome, 'none'), codexDir: path.join(codexHome, 'sessions'), opencodeDb: null, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  monitor.start();
  line('session_meta', { id: tid, cwd: 'C:\\work\\hay' });
  line('event_msg', { type: 'task_started', turn_id: 't1' });
  await sleep(300); // the room opens, the rest happens live
  line('event_msg', { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: '# Files mentioned\n\n## My request:\nRedo the diagram please' }] } });
  line('event_msg', { type: 'item_completed', item: { type: 'CommandExecution', command: ['pwsh', '-Command', 'ls'], parsed_cmd: [{ type: 'read', cmd: 'cat a.md', name: 'a.md', path: 'C:/work/hay/a.md' }] } });
  line('event_msg', { type: 'item_completed', item: { type: 'FileChange', changes: { 'C:\\work\\hay\\out.py': { type: 'add', content: 'x' } } } });
  line('event_msg', { type: 'task_complete', last_agent_message: 'Diagram redone.\n\n- four charts' });
  await sleep(500);
  monitor.stop();
  const session = events.find((e) => e.type === 'session');
  assert.equal(session.provider, 'codex');
  assert.equal(session.project, 'hay');
  const last = events.filter((e) => e.type === 'session').pop();
  assert.equal(last.title, 'Redo the diagram', 'thread name from session_index.jsonl');
  const says = events.filter((e) => e.type === 'agent_say');
  assert.equal(says.find((e) => e.kind === 'task').text, 'Redo the diagram please');
  assert.deepEqual(says.filter((e) => e.kind === 'tool').map((e) => e.text), ['Reading a.md', 'Writing out.py']);
  assert.equal(says.find((e) => e.kind === 'text').full, 'Diagram redone.\n\n- four charts');
  assert.ok(events.some((e) => e.type === 'agent_done' && e.agentId === 'main'), 'task_complete releases the director');
  fs.rmSync(codexHome, { recursive: true, force: true });
});

test('OpenCode sessions are read from its database, sub-agents included', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-office-'));
  const dbFile = path.join(root, 'opencode.db');
  const db = new DatabaseSync(dbFile);
  db.exec(`create table session_v2 (id text primary key, parent_id text, directory text, title text, time_created integer, time_updated integer);
    create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text);
    create unique index m_seq on session_message (session_id, seq);
    create index m_time on session_message (time_created);`);
  let seq = 0;
  const put = (sid, type, data) => {
    const now = Date.now();
    db.prepare('insert into session_message values (?,?,?,?,?,?,?)').run(`msg_${seq}`, sid, type, seq++, now, now, JSON.stringify(data));
  };
  const now = Date.now();
  db.prepare('insert into session_v2 values (?,?,?,?,?,?)').run('ses_main', null, 'E:/RAMOpt', 'Plan the cleaner', now, now);
  put('ses_main', 'user', { text: 'Plan a RAM cleaner' });
  const events = [];
  const monitor = createMonitor({ claudeDir: path.join(root, 'none'), codexDir: null, opencodeDb: dbFile, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  monitor.start();
  await sleep(300);
  const t = Date.now();
  put('ses_main', 'assistant', {
    time: { created: t, completed: t },
    content: [
      { type: 'reasoning', text: '**Looking around**', time: { created: t, completed: t } },
      { type: 'tool', id: 'call_read', name: 'read', state: { status: 'completed', input: { path: 'src/main.rs' } } },
      { type: 'tool', id: 'call_sub', name: 'subagent', state: { status: 'running', input: { agent: 'general', description: 'Inspect architecture' } } },
    ],
  });
  await sleep(300);
  db.prepare('insert into session_v2 values (?,?,?,?,?,?)').run('ses_kid', 'ses_main', 'E:/RAMOpt', 'Inspect architecture', Date.now(), Date.now());
  put('ses_kid', 'assistant', { time: { created: t, completed: t }, content: [{ type: 'tool', id: 'k1', name: 'grep', state: { status: 'completed', input: { pattern: 'memory' } } }] });
  await sleep(300);
  put('ses_main', 'assistant', {
    time: { created: t, completed: t },
    content: [
      { type: 'tool', id: 'call_sub', name: 'subagent', state: { status: 'completed', input: { agent: 'general', description: 'Inspect architecture' }, content: [{ type: 'text', text: '<subagent sessionID="ses_kid" state="completed">\nFound it.\n</subagent>' }] } },
      { type: 'text', text: 'Plan ready.', time: { created: t, completed: t } },
    ],
  });
  put('ses_main', 'idle', { outcome: 'succeeded' });
  await sleep(400);
  monitor.stop();
  db.close();
  const session = events.find((e) => e.type === 'session');
  assert.equal(session.provider, 'opencode');
  assert.equal(session.project, 'RAMOpt');
  const says = events.filter((e) => e.type === 'agent_say');
  assert.equal(says.find((e) => e.kind === 'task').text, 'Plan a RAM cleaner');
  assert.ok(says.some((e) => e.agentId === 'main' && e.kind === 'tool' && e.text === 'Reading main.rs'));
  assert.ok(events.some((e) => e.type === 'agent_start' && e.agentId === 'call_sub'), 'subagent tool call spawns an agent');
  assert.ok(says.some((e) => e.agentId === 'call_sub' && e.kind === 'tool'), "the child session's work is shown by that agent");
  assert.equal(events.find((e) => e.type === 'agent_done' && e.agentId === 'call_sub')?.summary, 'Found it.');
  assert.equal(says.find((e) => e.kind === 'text')?.text, 'Plan ready.');
  assert.ok(events.some((e) => e.type === 'agent_done' && e.agentId === 'main'), 'idle releases the director');
  assert.equal(events.filter((e) => e.type === 'session').every((e) => e.sessionId === 'ses_main'), true, 'sub-agent sessions are not rooms');
  fs.rmSync(root, { recursive: true, force: true });
});
