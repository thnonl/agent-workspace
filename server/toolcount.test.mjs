// The session event carries `toolCalls`: how many tool calls the session has made (main agent and sub-agents), also the ones
// read from the transcript's history. The page seats people in a working room nobody has looked at yet by this count.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = (o) => `${JSON.stringify(o)}\n`;
const call = (sid, id) => line({
  type: 'assistant', timestamp: new Date().toISOString(), cwd: 'E:\\demo', sessionId: sid,
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: `E:\\demo\\${id}.txt` } }], stop_reason: 'tool_use' },
});
const result = (sid, id) => line({
  type: 'user', timestamp: new Date().toISOString(), cwd: 'E:\\demo', sessionId: sid, toolUseResult: {},
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
});

test('the session event counts the tool calls, history included', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolcount-'));
  const project = path.join(root, 'E--demo');
  fs.mkdirSync(project, { recursive: true });
  const sid = '88888888-2222-3333-4444-555555555555';
  const file = path.join(project, `${sid}.jsonl`);
  fs.writeFileSync(file, line({ type: 'user', timestamp: new Date().toISOString(), cwd: 'E:\\demo', sessionId: sid, message: { role: 'user', content: 'read a lot' } }));
  for (let i = 0; i < 6; i++) fs.appendFileSync(file, call(sid, `h${i}`) + result(sid, `h${i}`));
  const events = [];
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, sessionsDir: null, windowMs: 30 * 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  try {
    monitor.start();
    await sleep(300);
    // read after the fact: the six calls of the history are known
    const first = monitor.snapshot().find((e) => e.type === 'session');
    assert.equal(first.toolCalls, 6);
    // four more come in live: the page hears about them a moment later
    for (let i = 0; i < 4; i++) fs.appendFileSync(file, call(sid, `l${i}`));
    await sleep(800);
    const last = events.filter((e) => e.type === 'session').at(-1);
    assert.ok(last, 'a session event follows the new calls');
    assert.equal(last.toolCalls, 10);
  } finally {
    monitor.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
