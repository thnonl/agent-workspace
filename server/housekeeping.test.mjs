// The Claude app appends housekeeping lines (bridge-session, last-prompt, cost-state …) to old transcripts when it starts, closes or
// archives a session. They must not make an old conversation look like work that is going on now.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOUR = 3_600_000;

const line = (o) => `${JSON.stringify(o)}\n`;
const housekeeping = (sid) =>
  line({ type: 'bridge-session', sessionId: sid, bridgeSessionId: 'cse_x' }) +
  line({ type: 'last-prompt', lastPrompt: 'hello', sessionId: sid }) +
  line({ type: 'cost-state', sessionId: sid, totalCostUSD: 1 });

test('an old conversation with fresh housekeeping lines is not opened as a room', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'housekeeping-'));
  const project = path.join(root, 'E--demo');
  fs.mkdirSync(project, { recursive: true });
  const sid = '44444444-2222-3333-4444-555555555555';
  const file = path.join(project, `${sid}.jsonl`);
  const old = new Date(Date.now() - 5 * HOUR).toISOString();
  fs.writeFileSync(file, line({ type: 'user', timestamp: old, cwd: 'E:\\demo', sessionId: sid, message: { role: 'user', content: 'an old prompt' } }));
  fs.appendFileSync(file, line({ type: 'assistant', timestamp: old, cwd: 'E:\\demo', sessionId: sid, message: { role: 'assistant', content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' } }));
  fs.appendFileSync(file, housekeeping(sid)); // (the file is as young as it can be)
  const events = [];
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, sessionsDir: null, windowMs: 30 * 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  try {
    monitor.start();
    await sleep(400);
    assert.equal(events.filter((e) => e.type === 'session').length, 0, 'the old conversation must not be announced');
    assert.equal(monitor.sessionCount(), 0);
    // the app touches it again (another archive): still nothing
    fs.appendFileSync(file, housekeeping(sid));
    await sleep(400);
    assert.equal(monitor.sessionCount(), 0);
    // a real new prompt brings it back, with the time of that prompt
    fs.appendFileSync(file, line({ type: 'user', timestamp: new Date().toISOString(), cwd: 'E:\\demo', sessionId: sid, message: { role: 'user', content: 'new prompt' } }));
    await sleep(600);
    const ev = events.find((e) => e.type === 'session');
    assert.ok(ev, 'a real new line opens the room');
    assert.ok(Date.now() - ev.updatedAt < 60_000, 'updatedAt is the time of the new line');
  } finally {
    monitor.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('housekeeping lines do not renew a quiet open session', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'housekeeping-'));
  const project = path.join(root, 'E--demo');
  fs.mkdirSync(project, { recursive: true });
  const sid = '55555555-2222-3333-4444-555555555555';
  const file = path.join(project, `${sid}.jsonl`);
  const stamp = new Date(Date.now() - 20 * 60_000).toISOString();
  fs.writeFileSync(file, line({ type: 'user', timestamp: stamp, cwd: 'E:\\demo', sessionId: sid, message: { role: 'user', content: 'twenty minutes ago' } }));
  fs.appendFileSync(file, line({ type: 'assistant', timestamp: stamp, cwd: 'E:\\demo', sessionId: sid, message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } }));
  const events = [];
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, sessionsDir: null, windowMs: 30 * 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  try {
    monitor.start();
    await sleep(400);
    const first = events.find((e) => e.type === 'session');
    assert.ok(first, 'a session of 20 minutes ago is inside the window');
    const age = Date.now() - first.updatedAt;
    assert.ok(age > 19 * 60_000 && age < 21 * 60_000, `updatedAt is the time of its last line, not of the file (${Math.round(age / 1000)} s old)`);
    fs.appendFileSync(file, housekeeping(sid));
    await sleep(500);
    const later = events.filter((e) => e.type === 'session').pop();
    assert.ok(Date.now() - later.updatedAt > 19 * 60_000, 'housekeeping lines leave updatedAt alone');
  } finally {
    monitor.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
