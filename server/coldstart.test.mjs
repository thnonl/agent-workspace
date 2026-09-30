// Cold start of a huge transcript: the silent first load only reads a tail, yet the snapshot must keep the prompt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sid = '22222222-2222-3333-4444-555555555555';
const base = { cwd: 'E:\demo', sessionId: sid, isSidechain: false };
const asst = (content, stop = null) => ({ ...base, type: 'assistant', message: { role: 'assistant', content, stop_reason: stop } });
const usr = (content, extra = {}) => ({ ...base, type: 'user', message: { role: 'user', content }, ...extra });
const bigResult = (id, mb) => usr([{ type: 'tool_result', tool_use_id: id, content: 'x'.repeat(mb * 1024 * 1024) }]);

function build(root, lines) {
  const dir = path.join(root, 'E--demo');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sid}.jsonl`);
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

async function snapshotOf(lines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-'));
  const file = build(root, lines);
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.start();
  await sleep(600);
  const snap = monitor.snapshot();
  monitor.stop();
  const size = fs.statSync(file).size;
  fs.rmSync(root, { recursive: true, force: true });
  return { snap, size };
}

const info = (snap) => ({
  session: snap.find((e) => e.type === 'session'),
  running: snap.filter((e) => e.type === 'agent_start' && e.agentId !== 'main').map((e) => e.agentId),
});

test('cold start: prompt and final within the last 100 KB of a >10 MB transcript', async () => {
  const lines = [usr('ancient prompt'), asst([{ type: 'text', text: 'old answer' }], 'end_turn')];
  for (let i = 0; i < 6; i++) lines.push(bigResult('t' + i, 2));
  lines.push(usr('the real prompt'));
  lines.push(asst([{ type: 'tool_use', id: 'toolu_run', name: 'Agent', input: { description: 'still running' } }], 'tool_use'));
  lines.push(asst([{ type: 'text', text: 'Final answer.' }], 'end_turn'));
  const { snap, size } = await snapshotOf(lines);
  assert.ok(size > 10 * 1024 * 1024);
  const { session, running } = info(snap);
  assert.equal(session.lastPrompt, 'the real prompt');
  assert.equal(session.lastFinal, 'Final answer.');
  assert.deepEqual(running, ['toolu_run']);
});

test('cold start: last prompt and a running sub-agent are more than 4 MB before the end', async () => {
  const lines = [usr('prompt before the huge output'), asst([{ type: 'tool_use', id: 'toolu_run', name: 'Agent', input: { description: 'still running' } }, { type: 'tool_use', id: 'toolu_bash', name: 'Bash', input: { command: 'cat big' } }], 'tool_use')];
  lines.push(bigResult('toolu_bash', 6));
  lines.push(asst([{ type: 'text', text: 'Summary after the big output.' }], 'end_turn'));
  const { snap, size } = await snapshotOf(lines);
  assert.ok(size > 6 * 1024 * 1024);
  const { session, running } = info(snap);
  console.log('>4MB case:', JSON.stringify({ prompt: session.lastPrompt, final: session.lastFinal, running }));
  assert.equal(session.lastPrompt, 'prompt before the huge output');
  assert.equal(session.lastFinal, 'Summary after the big output.');
  assert.deepEqual(running, ['toolu_run']);
});
