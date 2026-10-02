// A picture a tool brings back (a screenshot, an image the agent read) becomes a job of its own: an agent_say with a link to the
// monitor's copy, served by the API.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';
import { createApi } from './api.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = (o) => `${JSON.stringify(o)}\n`;
// a 1x1 transparent PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('an image in a tool result is announced as a job with a link the API serves', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'image-'));
  const project = path.join(root, 'E--demo');
  fs.mkdirSync(project, { recursive: true });
  const sid = '66666666-2222-3333-4444-555555555555';
  const file = path.join(project, `${sid}.jsonl`);
  const now = () => new Date().toISOString();
  fs.writeFileSync(file, line({ type: 'user', timestamp: now(), cwd: 'E:\\demo', sessionId: sid, message: { role: 'user', content: 'take a screenshot' } }));
  const events = [];
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, sessionsDir: null, windowMs: 30 * 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  try {
    monitor.start();
    await sleep(300);
    fs.appendFileSync(file, line({
      type: 'assistant', timestamp: now(), cwd: 'E:\\demo', sessionId: sid,
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu1', name: 'mcp__chrome-devtools__take_screenshot', input: {} }], stop_reason: 'tool_use' },
    }));
    fs.appendFileSync(file, line({
      type: 'user', timestamp: now(), cwd: 'E:\\demo', sessionId: sid, toolUseResult: [],
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: 'Took a screenshot' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } }] }] },
    }));
    await sleep(400);
    const ev = events.find((e) => e.type === 'agent_say' && e.image);
    assert.ok(ev, 'the picture is announced');
    assert.equal(ev.agentId, 'main');
    assert.equal(ev.kind, 'tool');
    assert.equal(ev.tool, 'Image');
    assert.equal(ev.text, 'Image from take_screenshot');
    assert.match(ev.image, /^\/api\/image\/[0-9a-z]+$/);

    // the API hands out the bytes
    const api = createApi(monitor);
    const res = await new Promise((resolve) => {
      const r = { head: null, body: null, writeHead(status, h) { this.head = { status, h }; }, end(b) { this.body = b; resolve(this); } };
      api({ url: ev.image, headers: {} }, r, () => resolve({ head: { status: 'next' } }));
    });
    assert.equal(res.head.status, 200);
    assert.equal(res.head.h['Content-Type'], 'image/png');
    assert.deepEqual(res.body, Buffer.from(PNG, 'base64'));
    const missing = await new Promise((resolve) => {
      const r = { head: null, writeHead(status) { this.head = { status }; }, end() { resolve(this); } };
      api({ url: '/api/image/nope', headers: {} }, r, () => resolve({ head: { status: 'next' } }));
    });
    assert.equal(missing.head.status, 404);
  } finally {
    monitor.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
