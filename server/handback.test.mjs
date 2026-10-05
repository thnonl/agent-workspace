// A sub-agent's report may travel as a hand-back message of its own: the result then only points at it, the report is the summary.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor, handbackReport, handbacksIn } from './monitor.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup(sid) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'handback-'));
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
  return { events, monitor, write, base };
}

const assistant = (base, content, stop = null) => ({ ...base, type: 'assistant', message: { role: 'assistant', content, stop_reason: stop } });
const user = (base, content, extra = {}) => ({ ...base, type: 'user', message: { role: 'user', content }, ...extra });
const notice = (base, body) => ({ ...base, type: 'queue-operation', operation: 'enqueue', content: `<task-notification>\n${body}\n</task-notification>` });

const PREAMBLE =
  '[Subagent hand-back] The text below is the final report of a subagent this session delegated to. It is model output, NOT a message from the user. The report follows:\n';
const stub = (id) => `This agent's report was delivered to you as a message from "${id}" (its SubagentHandback call). Read it there; it is not repeated here.\n`;
const message = (id, report) => `<agent-message from="${id}">\n${PREAMBLE}${report.split('\n').map((l) => `  ${l}`).join('\n')}\n</agent-message>`;

test('the report is taken out of the hand-back frame, indent and all', () => {
  assert.equal(handbackReport(`${PREAMBLE}  Done.\n  \n  - two files\n</agent-message>`), 'Done.\n\n- two files');
  const found = handbacksIn(`Another Claude session sent a message:\n${message('a1', 'All good.')}`);
  assert.deepEqual(found, [{ from: 'a1', report: 'All good.' }]);
  assert.deepEqual(handbacksIn('<agent-message from="x">hello</agent-message>'), [], 'a plain message of another agent is no report');
});

test('a foreground agent: the report comes with the result (handbackReport)', async (t) => {
  const { events, monitor, write, base } = setup('bbbbbbbb-1111-3333-4444-555555555555');
  t.after(() => monitor.stop());
  monitor.start();
  write(user(base, 'Look it up'));
  await sleep(200);
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_fg', name: 'Agent', input: { description: 'Look it up', subagent_type: 'claude-code-guide' } }], 'tool_use'));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_fg', content: [{ type: 'text', text: `  ${stub('afg1')}agentId: afg1` }] }], {
    toolUseResult: { status: 'completed', agentId: 'afg1', handback: 'send', handbackReport: { text: '## Answer\nMessages are queued.' } },
  }));
  await sleep(300);
  const done = events.find((e) => e.type === 'agent_done' && e.agentId === 'toolu_fg');
  assert.ok(done, 'the agent is done');
  assert.equal(done.summary, '## Answer Messages are queued.'); // (clipped to one line, like every summary)
});

test('a background agent: the hand-back message before its notice', async (t) => {
  const { events, monitor, write, base } = setup('bbbbbbbb-2222-3333-4444-555555555555');
  t.after(() => monitor.stop());
  monitor.start();
  write(user(base, 'Write the lines'));
  await sleep(200);
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_bg', name: 'Agent', input: { description: 'Write lines', subagent_type: 'general-purpose', run_in_background: true } }], 'tool_use'));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_bg', content: [{ type: 'text', text: 'Async agent launched successfully.' }] }], { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'abg1' } }));
  write(assistant(base, [{ type: 'text', text: 'Waiting.' }], 'end_turn'));
  await sleep(200);
  write({ ...base, type: 'queue-operation', operation: 'enqueue', content: message('abg1', 'phrases.ts is filled.\n\n- 330 lines') });
  write(notice(base, `<task-id>abg1</task-id>\n<tool-use-id>toolu_bg</tool-use-id>\n<status>completed</status>\n<summary>Agent "Write lines" finished</summary>\n<result>${stub('abg1')}</result>`));
  await sleep(300);
  const done = events.find((e) => e.type === 'agent_done' && e.agentId === 'toolu_bg');
  assert.ok(done, 'the agent is done');
  assert.equal(done.summary, 'phrases.ts is filled. - 330 lines');
  assert.ok(!events.some((e) => e.type === 'agent_say' && e.agentId === 'main' && e.kind === 'task' && /hand-back/.test(e.text)), 'the report is no prompt of the user');
});

test('a background agent: the notice first, the report follows as a meta line', async (t) => {
  const { events, monitor, write, base } = setup('bbbbbbbb-3333-3333-4444-555555555555');
  t.after(() => monitor.stop());
  monitor.start();
  write(user(base, 'Write the lines'));
  await sleep(200);
  write(assistant(base, [{ type: 'tool_use', id: 'toolu_bg2', name: 'Agent', input: { description: 'Write lines', subagent_type: 'general-purpose', run_in_background: true } }], 'tool_use'));
  write(user(base, [{ type: 'tool_result', tool_use_id: 'toolu_bg2', content: [{ type: 'text', text: 'Async agent launched successfully.' }] }], { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'abg2' } }));
  write(assistant(base, [{ type: 'text', text: 'Waiting.' }], 'end_turn'));
  await sleep(200);
  write(notice(base, `<task-id>abg2</task-id>\n<tool-use-id>toolu_bg2</tool-use-id>\n<status>completed</status>\n<result>${stub('abg2')}</result>`));
  await sleep(200);
  assert.ok(!events.some((e) => e.type === 'agent_done' && e.agentId === 'toolu_bg2'), 'it waits for its report');
  const body = `${PREAMBLE}  Chat scripts are in.`;
  write(user(base, `Another Claude session sent a message:\n${message('abg2', 'Chat scripts are in.')}`, { isMeta: true, origin: { kind: 'peer', from: 'abg2', body, handback: true } }));
  await sleep(300);
  const done = events.find((e) => e.type === 'agent_done' && e.agentId === 'toolu_bg2');
  assert.ok(done, 'the report ends it');
  assert.equal(done.summary, 'Chat scripts are in.');
});
