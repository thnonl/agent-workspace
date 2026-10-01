// How full the context window is: Claude Code usage, Codex token_count, OpenCode message tokens + config limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.mjs';
import { claudeContext, guessWindow, parseTokens } from './util.mjs';
import { claudeWindow, modelWindow } from './models.mjs';
import { createCodexParser } from './codex.mjs';
import { modelLimit } from './opencode.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('parseTokens and guessWindow', () => {
  assert.equal(parseTokens('200k'), 200_000);
  assert.equal(parseTokens('1m'), 1_000_000);
  assert.equal(parseTokens('1.5M'), 1_500_000);
  assert.equal(parseTokens('abc'), 0);
  assert.equal(guessWindow('claude-sonnet-4-5', 50_000), 200_000);
  assert.equal(guessWindow('claude-sonnet-4-5[1m]', 50_000), 1_000_000);
  assert.equal(guessWindow('claude-sonnet-4-5', 506_000), 1_000_000, 'a session that outgrew 200k has a bigger window');
  assert.equal(guessWindow('x', 1_200_000), 2_000_000);
});

test('claudeWindow: the Claude table', () => {
  const M = 1_000_000;
  const K = 200_000;
  for (const [id, w] of [
    ['claude-fable-5-1', M], ['claude-opus-5-5', M], ['claude-opus-5', M], ['claude-opus-4-8', M], ['claude-opus-4-6', M],
    ['claude-sonnet-5-5', M], ['claude-sonnet-4-6', M], ['claude-mythos-preview', M],
    ['claude-haiku-4-5-20251001', K], ['claude-opus-4-5-20251101', K], ['claude-opus-4-1-20250805', K], ['claude-opus-4-20250514', K],
    ['claude-sonnet-4-5-20250929', K], ['claude-sonnet-4-20250514', K], ['claude-3-5-sonnet-20241022', K], ['claude-3-opus-20240229', K],
    ['kr/claude-sonnet-4.5-thinking-agentic', K], ['kr/claude-haiku-4.5', K], ['anthropic.claude-opus-4-6-v1:0', M], ['claude-haiku-4-5@20251001', K],
    ['gpt-5.5', 0], ['main-agent', 0], ['', 0],
  ]) assert.equal(claudeWindow(id), w, id);
  assert.equal(modelWindow('claude-sonnet-4-5[1m]'), M);
});

test('modelWindow reads the Codex model cache (context_window x effective_context_window_percent)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
  fs.writeFileSync(path.join(home, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'gpt-x', context_window: 272_000, effective_context_window_percent: 95 }, { slug: 'gpt-y', context_window: 100_000 }] }));
  const prev = process.env.CODEX_HOME;
  process.env.CODEX_HOME = home;
  try {
    assert.equal(modelWindow('gpt-x'), 258_400, 'the number Codex reports in token_count');
    assert.equal(modelWindow('gpt-y'), 100_000);
    assert.equal(modelWindow('openai/gpt-x'), 258_400);
  } finally {
    if (prev === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('claudeContext adds input, cache and output tokens; synthetic messages count for nothing', () => {
  const c = claudeContext({ model: 'claude-opus-4-1', usage: { input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: 90_000, output_tokens: 500 } });
  assert.equal(c.used, 91_502);
  assert.equal(c.window, 200_000);
  assert.equal(c.exact, true, 'Opus 4.1 is in the model table');
  assert.equal(claudeContext({ model: 'some-gateway-model', usage: { input_tokens: 5 } }).exact, false, 'an unlisted model is guessed');
  assert.equal(claudeContext({ model: '<synthetic>', usage: { input_tokens: 5 } }), null);
  assert.equal(claudeContext({ model: 'm' }), null);
});

test('Codex token_count: the size of the last request and the window Codex reports', () => {
  const got = [];
  const handle = createCodexParser({ say() {}, mainStart() {}, mainEnd() {}, context: (s, c) => got.push(c) });
  const s = { model: '' };
  handle(s, { type: 'turn_context', payload: { model: 'gpt-5-codex' } });
  handle(s, { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 33320, output_tokens: 268, total_tokens: 33588 }, model_context_window: 258400 } } });
  assert.deepEqual(got[0], { used: 33588, window: 258400, exact: true, model: 'gpt-5-codex' });
});

test('OpenCode model limits come from the config file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-oc-'));
  const file = path.join(dir, 'opencode.json');
  fs.writeFileSync(file, JSON.stringify({ provider: { 9: {}, router: { models: { big: { limit: { context: 922000 } }, none: {} } } } }));
  const prev = process.env.OPENCODE_CONFIG;
  process.env.OPENCODE_CONFIG = file;
  try {
    assert.equal(modelLimit('router', 'big'), 922000);
    assert.equal(modelLimit('router', 'none'), 0);
    assert.equal(modelLimit('other', 'big'), 0);
  } finally {
    if (prev === undefined) delete process.env.OPENCODE_CONFIG;
    else process.env.OPENCODE_CONFIG = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the monitor tells the page how full the context is (session event, also in the snapshot)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-office-ctx-'));
  const project = path.join(root, 'E--demo');
  fs.mkdirSync(project, { recursive: true });
  const sid = '77777777-2222-3333-4444-555555555555';
  const file = path.join(project, `${sid}.jsonl`);
  const events = [];
  const monitor = createMonitor({ claudeDir: root, codexDir: null, opencodeDb: null, windowMs: 60_000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  const base = { cwd: 'E:\demo', sessionId: sid, isSidechain: false };
  const write = (obj) => fs.appendFileSync(file, `${JSON.stringify(obj)}\n`);
  monitor.start();
  try {
    write({ ...base, type: 'user', message: { role: 'user', content: 'Hello' } });
    const usage = (n) => ({ input_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: n, output_tokens: 100 });
    write({ ...base, type: 'assistant', message: { role: 'assistant', model: 'claude-opus-4-1', stop_reason: 'tool_use', usage: usage(40_000), content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.ts' } }] } });
    write({ ...base, type: 'assistant', message: { role: 'assistant', model: 'claude-opus-4-1', stop_reason: 'end_turn', usage: usage(60_000), content: [{ type: 'text', text: 'done' }] } });
    await sleep(700);
    const withCtx = events.filter((e) => e.type === 'session' && e.context);
    assert.ok(withCtx.length >= 1, 'a session event carries the context');
    assert.equal(withCtx.at(-1).context.used, 60_103, 'the last message wins');
    assert.equal(withCtx.at(-1).context.window, 200_000);
    assert.ok(withCtx.length <= 2, 'a burst of messages is not an event each');
    assert.equal(monitor.snapshot().find((e) => e.type === 'session')?.context?.used, 60_103);
  } finally {
    monitor.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
