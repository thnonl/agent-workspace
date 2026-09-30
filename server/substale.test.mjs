// Sub-agent folder with many old files: they are not re-read on every poll, a fresh file is still adopted quickly.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('80 stale sub-agent files are not re-read; a fresh one is adopted quickly', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'substale-'));
  const project = path.join(root, 'E--demo');
  const sid = '33333333-2222-3333-4444-555555555555';
  const subDir = path.join(project, sid, 'subagents');
  fs.mkdirSync(subDir, { recursive: true });
  const file = path.join(project, `${sid}.jsonl`);
  const base = { cwd: 'E:\demo', sessionId: sid, isSidechain: false };
  const write = (o) => fs.appendFileSync(file, `${JSON.stringify(o)}\n`);
  write({ ...base, type: 'user', message: { role: 'user', content: 'hot session' } });
  const old = new Date(Date.now() - 30 * 60_000);
  for (let i = 0; i < 80; i++) {
    const jl = path.join(subDir, `agent-old${i}.jsonl`);
    fs.writeFileSync(path.join(subDir, `agent-old${i}.meta.json`), JSON.stringify({ toolUseId: `toolu_old${i}`, description: `old ${i}` }));
    fs.writeFileSync(jl, `${JSON.stringify({ ...base, isSidechain: true, type: 'assistant', message: { content: [{ type: 'text', text: 'x' }], stop_reason: 'end_turn' } })}\n`);
    fs.utimesSync(jl, old, old);
  }
  let subReads = 0;
  const counted = ['readFileSync', 'statSync', 'readdirSync'].map((k) => {
    const real = fs[k];
    fs[k] = function (p, ...a) {
      if (String(p).includes(`${path.sep}subagents`)) subReads++;
      return real.call(this, p, ...a);
    };
    return [k, real];
  });
  const events = [];
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, windowMs: 3_600_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  try {
    monitor.start();
    await sleep(500);
    assert.equal(events.filter((e) => e.type === 'agent_start' && e.agentId.startsWith('toolu_old')).length, 0, 'stale agents are not adopted');
    // idle but hot (hot window = 40 polls = 1.2 s)
    subReads = 0;
    await sleep(700);
    const idleReads = subReads;
    // main transcript keeps growing: the watcher marks the session dirty on every write
    subReads = 0;
    for (let i = 0; i < 20; i++) {
      write({ ...base, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `step ${i}` }], stop_reason: null } });
      await sleep(30);
    }
    const growingReads = subReads;
    // a fresh sub-agent appears
    const t0 = Date.now();
    fs.writeFileSync(path.join(subDir, 'agent-fresh.meta.json'), JSON.stringify({ toolUseId: 'toolu_fresh', description: 'fresh one' }));
    fs.writeFileSync(path.join(subDir, 'agent-fresh.jsonl'), `${JSON.stringify({ ...base, isSidechain: true, type: 'assistant', message: { content: [{ type: 'tool_use', id: 'f1', name: 'Read', input: { file_path: 'C:\a.txt' } }], stop_reason: 'tool_use' } })}\n`);
    let adoptedIn = -1;
    while (Date.now() - t0 < 7000) {
      if (events.some((e) => e.type === 'agent_start' && e.agentId === 'toolu_fresh')) {
        adoptedIn = Date.now() - t0;
        break;
      }
      await sleep(20);
    }
    console.log(`sub-folder fs calls: idle 700ms=${idleReads}, main growing 20 writes=${growingReads}; fresh adopted after ${adoptedIn} ms`);
    assert.ok(adoptedIn >= 0 && adoptedIn < 6000, 'fresh sub-agent adopted');
    assert.ok(idleReads < 40, `idle polls re-read the stale files (${idleReads} fs calls)`);
    assert.ok(growingReads < 400, `growing main transcript re-reads the stale files (${growingReads} fs calls)`);
  } finally {
    for (const [k, real] of counted) fs[k] = real;
    monitor.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
