// Background commands (Bash / PowerShell run_in_background, Monitor) are tasks of their own until their <task-notification>.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup(sid) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'background-'));
  const project = path.join(root, 'E--demo');
  fs.mkdirSync(project, { recursive: true });
  const sessionsDir = path.join(root, 'sessions');
  fs.mkdirSync(sessionsDir);
  const file = path.join(project, `${sid}.jsonl`);
  const events = [];
  const monitor = createMonitor({ claudeDir: root, sessionsDir, codexDir: null, opencodeDb: null, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  const write = (obj) => fs.appendFileSync(file, `${JSON.stringify(obj)}\n`);
  const base = { cwd: 'E:\\demo', sessionId: sid, isSidechain: false };
  return { sessionsDir, events, monitor, write, base };
}

const assistant = (base, content, stop = null) => ({ ...base, type: 'assistant', message: { role: 'assistant', content, stop_reason: stop } });
const user = (base, content, extra = {}) => ({ ...base, type: 'user', message: { role: 'user', content }, ...extra });
const notice = (base, body) => ({ ...base, type: 'queue-operation', operation: 'enqueue', content: `<task-notification>\n${body}\n</task-notification>` });

test('a background command stays a running task after the turn ends, until its notification', async (t) => {
  const { events, monitor, write, base } = setup('66666666-2222-3333-4444-555555555555');
  t.after(() => monitor.stop());
  monitor.start();
  write(user(base, 'Run the tests in the background'));
  await sleep(200);
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_bg', name: 'Bash', input: { command: 'npm test', description: 'Run the tests', run_in_background: true } }], 'tool_use'));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_bg', content: 'Command running in background with ID: b1abc. Output is being written to: x.output.' }], { toolUseResult: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1abc' } }));
  // a plain call that ends at once is no background task
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_ls', name: 'Bash', input: { command: 'ls' } }], 'tool_use'));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_ls', content: 'a b' }], { toolUseResult: { stdout: 'a b', stderr: '' } }));
  write(assistant(base, [{ type: 'text', text: 'Tests are running.' }], 'end_turn'));
  await sleep(300);

  const start = events.find((e) => e.type === 'agent_start' && e.agentId === 'toolu_bg');
  assert.ok(start, 'the background command becomes a task');
  assert.equal(start.agentType, 'background');
  assert.equal(start.label, 'Run the tests');
  assert.ok(!events.some((e) => e.type === 'agent_start' && e.agentId === 'toolu_ls'), 'a finished call is not a background task');
  assert.ok(events.some((e) => e.type === 'agent_done' && e.agentId === 'main'), 'the turn ended');
  assert.ok(!events.some((e) => e.type === 'agent_done' && e.agentId === 'toolu_bg'), 'the command is still running');

  write(notice(base, '<task-id>b1abc</task-id>\n<tool-use-id>toolu_bg</tool-use-id>\n<status>failed</status>\n<summary>Background command "Run the tests" failed with exit code 1</summary>'));
  await sleep(300);
  monitor.stop();
  const done = events.find((e) => e.type === 'agent_done' && e.agentId === 'toolu_bg');
  assert.ok(done, 'the notification ends it');
  assert.equal(done.failed, true);
  assert.match(done.summary, /exit code 1/);
});

test('a Monitor keeps watching through its events and ends with the stream', async (t) => {
  const { events, monitor, write, base } = setup('77777777-2222-3333-4444-555555555555');
  t.after(() => monitor.stop());
  monitor.start();
  write(user(base, 'Watch the build'));
  await sleep(200);
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_mon', name: 'Monitor', input: { command: 'tail -f build.log', description: 'Watch the build log' } }], 'tool_use'));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_mon', content: 'Monitor started.' }], { toolUseResult: { persistent: false, taskId: 'bmon1', timeoutMs: 300000 } }));
  write(assistant(base, [{ type: 'text', text: 'Watching.' }], 'end_turn'));
  await sleep(200);
  write(notice(base, '<task-id>bmon1</task-id>\n<summary>Monitor event: "Watch the build log"</summary>\n<event>compiled 12 files</event>'));
  await sleep(200);
  assert.ok(events.some((e) => e.type === 'agent_start' && e.agentId === 'toolu_mon'), 'the Monitor becomes a task');
  assert.ok(!events.some((e) => e.type === 'agent_done' && e.agentId === 'toolu_mon'), 'an event does not end it');
  assert.ok(events.some((e) => e.type === 'agent_say' && e.agentId === 'toolu_mon' && e.text === 'compiled 12 files'), 'the event is said');

  write(notice(base, '<task-id>bmon1</task-id>\n<tool-use-id>toolu_mon</tool-use-id>\n<status>completed</status>\n<summary>Monitor "Watch the build log" stream ended</summary>'));
  await sleep(300);
  monitor.stop();
  const done = events.find((e) => e.type === 'agent_done' && e.agentId === 'toolu_mon');
  assert.ok(done && !done.failed, 'the end of the stream ends it');
});

test('background commands end with their Claude Code process', async (t) => {
  const sid = '88888888-2222-3333-4444-555555555555';
  const { sessionsDir, events, monitor, write, base } = setup(sid);
  t.after(() => monitor.stop());
  // a pid that is not running (the status file outlived its process)
  fs.writeFileSync(path.join(sessionsDir, '999999.json'), JSON.stringify({ pid: 999999, sessionId: sid, status: 'idle' }));
  monitor.start();
  write(user(base, 'Start the dev server'));
  await sleep(200);
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_dev', name: 'PowerShell', input: { command: 'npx vite', run_in_background: true } }], 'tool_use'));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_dev', content: 'Command running in background with ID: bdev1.' }], { toolUseResult: { stdout: '', stderr: '', interrupted: false } }));
  write(assistant(base, [{ type: 'text', text: 'Server is up.' }], 'end_turn'));
  await sleep(300);
  monitor.stop();
  assert.ok(events.some((e) => e.type === 'agent_start' && e.agentId === 'toolu_dev' && e.label === 'npx vite'), 'found by the result text alone');
  const done = events.find((e) => e.type === 'agent_done' && e.agentId === 'toolu_dev');
  assert.ok(done?.failed, 'the process is gone: so is its command');
});

test('TaskStop ends the background command it stops (no notification follows)', async (t) => {
  const { events, monitor, write, base } = setup('99999999-2222-3333-4444-555555555555');
  t.after(() => monitor.stop());
  monitor.start();
  write(user(base, 'Run the slow suite'));
  await sleep(200);
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_slow', name: 'Bash', input: { command: 'npm test' } }], 'tool_use'));
  // moved to the background by its timeout: the result says so in toolUseResult only
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_slow', content: 'Command did not complete within its 300s timeout and was moved to the background (ID: bslow1).' }], { toolUseResult: { stdout: '', stderr: '', backgroundTaskId: 'bslow1', timedOutAfterMs: 300000 } }));
  await sleep(200);
  assert.ok(events.some((e) => e.type === 'agent_start' && e.agentId === 'toolu_slow'), 'the moved command becomes a task');
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_stop', name: 'TaskStop', input: { task_id: 'bslow1' } }], 'tool_use'));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_stop', content: '{"message":"Successfully stopped task: bslow1"}' }], { toolUseResult: { message: 'Successfully stopped task: bslow1', task_id: 'bslow1', task_type: 'local_bash' } }));
  await sleep(300);
  monitor.stop();
  const done = events.find((e) => e.type === 'agent_done' && e.agentId === 'toolu_slow');
  assert.ok(done?.failed, 'stopped');
  assert.ok(!events.some((e) => e.type === 'agent_start' && e.agentId === 'toolu_stop'), 'TaskStop itself is no background task');
});
