// A git commit / push run by the agent is a cue for a small celebration in the office.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';
import { cueOf } from './util.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('cueOf recognises git commit and git push in shell commands only', () => {
  assert.equal(cueOf('Bash', { command: 'git commit -m "x"' }), 'commit');
  assert.equal(cueOf('Bash', { command: 'git add . && git commit -am wip' }), 'commit');
  assert.equal(cueOf('PowerShell', { command: 'git -C E:\\repo commit -m x' }), 'commit');
  assert.equal(cueOf('Bash', { command: 'git push -u origin main' }), 'push');
  assert.equal(cueOf('Bash', { command: 'git commit -m x && git push' }), 'push', 'the bigger moment wins');
  assert.equal(cueOf('Bash', { command: 'git status' }), null);
  assert.equal(cueOf('Bash', { command: 'echo committed' }), null);
  assert.equal(cueOf('Read', { command: 'git commit' }), null, 'only shell tools count');
  assert.equal(cueOf('Bash', undefined), null);
});

test('the monitor passes the cue on with the tool call', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-office-cue-'));
  const project = path.join(root, 'E--demo');
  fs.mkdirSync(project, { recursive: true });
  const sid = '88888888-2222-3333-4444-555555555555';
  const file = path.join(project, `${sid}.jsonl`);
  const events = [];
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  const base = { cwd: 'E:\\demo', sessionId: sid, isSidechain: false };
  const write = (obj) => fs.appendFileSync(file, `${JSON.stringify(obj)}\n`);
  monitor.start();
  write({ ...base, type: 'user', message: { role: 'user', content: 'Ship it' } });
  try {
    write({ ...base, type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'git commit -m done' } }] } });
    await sleep(250);
    write({ ...base, type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_2', name: 'Bash', input: { command: 'ls' } }] } });
    await sleep(250);
    const tools = events.filter((e) => e.type === 'agent_say' && e.kind === 'tool');
    assert.equal(tools.length, 2);
    assert.equal(tools[0].cue, 'commit');
    assert.ok(!('cue' in tools[1]), 'other calls carry no cue');
  } finally {
    monitor.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
