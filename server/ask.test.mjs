// The agent asks the user something (AskUserQuestion / ExitPlanMode): an "ask" is pending until it is answered.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';
import { askOf } from './util.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-office-ask-'));
  const project = path.join(root, 'E--demo');
  fs.mkdirSync(project, { recursive: true });
  const sid = '99999999-2222-3333-4444-555555555555';
  const file = path.join(project, `${sid}.jsonl`);
  const events = [];
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  const write = (obj) => fs.appendFileSync(file, `${JSON.stringify(obj)}\n`);
  const base = { cwd: 'E:\demo', sessionId: sid, isSidechain: false };
  return { root, events, monitor, write, base };
}
const assistant = (base, content, stop = 'tool_use') => ({ ...base, type: 'assistant', message: { role: 'assistant', content, stop_reason: stop } });
const user = (base, content, extra = {}) => ({ ...base, type: 'user', message: { role: 'user', content }, ...extra });
const QUESTION = { type: 'tool_use', id: 'toolu_q', name: 'AskUserQuestion', input: { questions: [{ question: 'Which database?', header: 'DB', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }] } };

test('askOf reads questions, options and plans; other tools are no asks', () => {
  assert.equal(askOf('AskUserQuestion', QUESTION.input).text, 'Which database? — Postgres / SQLite');
  assert.equal(askOf('question', { questions: [{ question: 'Sure?' }] }).text, 'Sure?');
  assert.equal(askOf('ExitPlanMode', { plan: '# Plan\nDo it' }).text, 'Plan ready for approval: Plan');
  assert.equal(askOf('Bash', { command: 'ls' }), null);
});

test('an unanswered AskUserQuestion is an ask: late joiners get it, the answer ends it', async () => {
  const { root, events, monitor, write, base } = setup();
  monitor.start();
  write(user(base, 'Build it'));
  await sleep(150);
  write(assistant(base, [QUESTION]));
  await sleep(250);
  const asks = events.filter((e) => e.type === 'agent_ask');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].text, 'Which database? — Postgres / SQLite');
  assert.ok(monitor.snapshot().some((e) => e.type === 'agent_ask'), 'snapshot repeats the pending ask');
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_q', content: 'SQLite' }], { toolUseResult: { answers: {} } }));
  await sleep(250);
  assert.equal(events.filter((e) => e.type === 'agent_ask_end').length, 1);
  assert.ok(!monitor.snapshot().some((e) => e.type === 'agent_ask'));
  monitor.stop();
  fs.rmSync(root, { recursive: true, force: true });
});

test('a pending ask ends when the user sends a new prompt; other pending tools are no asks', async () => {
  const { root, events, monitor, write, base } = setup();
  monitor.start();
  write(user(base, 'Go'));
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_b', name: 'Bash', input: { command: 'sleep 99' } }]));
  await sleep(200);
  assert.equal(events.filter((e) => e.type === 'agent_ask').length, 0);
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_p', name: 'ExitPlanMode', input: { plan: 'Do the thing' } }]));
  await sleep(200);
  assert.equal(events.filter((e) => e.type === 'agent_ask').length, 1);
  write(user(base, 'never mind, do something else'));
  await sleep(200);
  assert.equal(events.filter((e) => e.type === 'agent_ask_end').length, 1);
  monitor.stop();
  fs.rmSync(root, { recursive: true, force: true });
});
