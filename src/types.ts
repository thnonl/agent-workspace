export type AgentRole = 'main' | 'sub';
/** `idle` = what a character is up to when there is no task (reading, getting a drink, waiting…); `Speech.tool` then names the icon */
export type SpeechKind = 'thinking' | 'text' | 'tool' | 'task' | 'done' | 'error' | 'idle';

/** Events produced by the transcript monitor (server) or the demo simulator (browser). */
export type MonitorEvent =
  | { type: 'hello'; claudeDir: string; windowMin: number }
  | { type: 'ready' }
  | { type: 'session'; sessionId: string; title: string; cwd: string; project: string; updatedAt: number; lastPrompt?: string; lastFinal?: string }
  | { type: 'session_end'; sessionId: string; reason?: 'idle' | 'gone' }
  | { type: 'agent_start'; sessionId: string; agentId: string; role: AgentRole; label: string; agentType?: string }
  | { type: 'agent_say'; sessionId: string; agentId: string; kind: SpeechKind; text: string; tool?: string; full?: string }
  | { type: 'agent_done'; sessionId: string; agentId: string; summary?: string; failed?: boolean };

export interface Speech {
  id: number;
  kind: SpeechKind;
  text: string;
  tool?: string;
  at: number;
  /** a bubble of the summary talk: it stays up this long (ms), is never dropped and never preempted */
  hold?: number;
}

export type PersonRole = 'director' | 'staff';

/**
 * A character in the office. People are not agents: the director stays for as long as the session
 * works, the staff take turns doing whatever tasks the session produces.
 */
export interface PersonRec {
  key: string;
  sessionId: string;
  role: PersonRole;
  /** the person's name, picked from the user's list */
  name: string;
  seed: number;
  /** should be inside the office (false → packs up, walks out and waits outside) */
  present: boolean;
  /** task being worked on right now (staff only) */
  taskKey: string | null;
  /** desk index in the room layout (staff only, fixed for the whole session) */
  desk: number;
  joinedAt: number;
  /** when the last task was handed over – the person who rested longest takes the next task */
  lastWorkEnd: number;
  /** set while everybody is leaving one after another: when this person has to go (ms, 0 = none) */
  leaveAt: number;
  demo: boolean;
}

/**
 * One unit of work shown by one character: a sub-agent run, or a burst of the main agent's own
 * tool calls.
 */
export interface TaskRec {
  key: string;
  sessionId: string;
  source: 'sub' | 'main';
  agentId: string;
  label: string;
  agentType: string;
  /** person working on it (null while it waits for somebody to be free) */
  assignee: string | null;
  /** the work is over – the assignee wraps up (sub-agent tasks are handed over as a report) */
  done: boolean;
  failed: boolean;
  summary: string;
  /** the report has been handed to the director */
  reported: boolean;
  /** tool-call tasks (source "main"): who made the call – "main" or the sub-agent's task – and the tool */
  origin: string;
  tool: string;
  /** tool-call tasks: the call itself (steps = 1) */
  steps: number;
  first: string;
  /** main-agent tasks: when the person is done with it (ms, 0 = not started) */
  closeAt: number;
  startedAt: number;
  finishedAt: number;
  demo: boolean;
}

/** What the office did in one run (from the first work to closing time), shown on the paper when a session is done. */
export interface RunSummary {
  roomId: string;
  /** made on demand from what is known so far (no run has finished yet, or one is still going) */
  partial?: boolean;
  startedAt: number;
  finishedAt: number;
  /** what the user asked */
  prompt: string;
  /** the last thing the main agent said */
  final: string;
  /** finished tasks of this run, oldest first */
  tasks: TaskLogEntry[];
  staff: number;
  reports: number;
}

/** One line of a session's activity feed. */
export interface ActivityEntry {
  id: number;
  at: number;
  roomId: string;
  kind: 'prompt' | 'thinking' | 'text' | 'tool' | 'task' | 'done' | 'report' | 'system' | 'error';
  /** who did / said it (a name, "You" or "Main agent") */
  who: string;
  /** what it is about – e.g. the sub-agent's task */
  ctx?: string;
  text: string;
  /** tool name (kind = tool) or "failed" (kind = done) */
  tool?: string;
}

/** A finished task, kept for the task / report lists of a room. */
export interface TaskLogEntry {
  key: string;
  label: string;
  source: 'sub' | 'main';
  agentType: string;
  /** name of the person who did it */
  who: string;
  startedAt: number;
  finishedAt: number;
  failed: boolean;
  reported: boolean;
  summary: string;
  origin: string;
  tool: string;
  steps: number;
  first: string;
}

export interface RoomRec {
  id: string;
  title: string;
  project: string;
  cwd: string;
  seed: number;
  themeIndex: number;
  index: number;
  updatedAt: number;
  createdAt: number;
  /** reports handed to the director so far (sub-agent tasks) */
  reports: number;
  /** tasks finished so far (sub-agent runs and bursts of the main agent's own tool calls) */
  tasksDone: number;
  /** the main agent is in the middle of a turn */
  mainActive: boolean;
  demo: boolean;
}
