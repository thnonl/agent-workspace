# 🏢 Claude Office

A cute, isometric 3D office that shows your **Claude Code** sessions at work, in real time.

* Every Claude Code **session** gets its own **room** (each with a different colour theme, layout, furniture and decorations).
* **Characters are not agents.** Every character – random gender, hair, outfit and colours – is a person of the office; the work they do comes from the session:
  * The **director** sits at the big executive desk for as long as the session works. They voice the **main agent** (the incoming prompt 📥, thinking 💭, messages 💬, "delegating…") and are the last to leave.
  * Every **task** is done by one **staff member**: a **sub-agent** run (Agent / Task tool), or **one tool call** – of the main agent *or of a sub-agent* (every call, delegating ones included, is its own short task done by the next person in line, so the calls are spread over the staff and each one is listed in the task list). The staff member sits at their own desk **facing the director**, takes the laptop out of the bag, opens it and types; their bubbles show the task's thinking, messages and tool calls (`Reading foo.ts`, `$ npm test`, …) 🔧.
  * The staff **take turns** (strict rotation – nobody gets two tasks in a row while somebody else is free): a new task hires a person until the team has 3 members (up to 7 when everybody is busy, one newcomer per 6 s); after that the task goes to whoever finished a task longest ago – including people who already went home – so nobody ends up doing everything.
* When a sub-agent task is done, its staff member walks to the **director's desk**, hands over the report (the pile on the desk grows) and goes back. **Nobody leaves after a task**: they stay at their desk, sit on the sofa or pet a cat until the next task comes round. The same goes for the director while nobody needs them.
* When the session has **no work left** (turn over, no sub-agent running) everybody packs up and **goes home one after another** – the staff first, the director last. New work → they walk back in.
* Rooms are procedurally furnished like a real office: **exactly 7 staff desks** (one per possible staff member) fanned out around the director (or long bench desks with dividers), meeting table, lounge, pantry, copier, file cabinets, server rack, vending machine, kanban / cork boards, wall TV dashboard, cluttered desks and scattered paper.
* **Speech bubbles stay** until the character does something else (after a few seconds they shrink to a compact form). A bubble always sits right above its own character – it is never moved aside, so two bubbles can overlap (the nearer character is drawn on top); the little arrows of all bubbles are drawn underneath all bubbles, so an arrow never covers somebody else's text. Breaks talk too – the thought appears **the moment the character decides** on the break, while it is still in the chair –, as **thought clouds** (💭 shape): "Reading “Clean Code”" 📖, "Pouring a cold glass of water" 🥤, "Watering the plants" 🪴, "Waiting for the next task" ⏳, "Time to go home. Bye!" 👋 …
* Whoever has **nothing to do** takes a break: walks around the office, sits on the sofa, stands behind a working colleague to watch, looks out of the window, pets one of the office cats – or does something in the office: **gets a drink** at the water cooler / coffee machine, **reads a book** from the bookshelf, **watches the fish** in the aquarium, **washes their face** at the sink, **waters the plants** with a watering can, **cooks noodles** on the kitchenette stove and **eats them right there** from a bowl, or **walks over to a colleague's desk for a chat** (they take turns, the colleague nods along). Or simply stays in the chair. Breaks are long (roughly 15–40 s) and far apart (20 s or more between two of them), so nobody hops from one thing to the next.
* A new task does **not** send anybody back to their desk: whoever is on a break (drinking, reading, on the sofa, cooking…) **works on it where they are** and then **carries on with the break**; a sub-agent task still ends with the walk to the director, after which they return to what they were doing. Somebody with nothing to do shows **no speech bubble** (just the name tag). Chat lines, greetings and goodbyes are shown as speech bubbles, plans for a break as thought clouds. Every activity has a long pool of phrases (`src/sim/phrases.ts`: greetings by time of day, break thoughts, cooking / eating lines, goodbyes, report lines, 30+ small-talk scripts) that never repeats the same line twice in a row.
* **Sound effects** (quiet, synthesised in the browser, no music, no files): the door, key clicks while somebody types, a pop for every speech bubble, a chime when a session is done, paper rustling, water, sipping, page turns, sizzling noodles, chopsticks, chat murmur, a meow. Only the room on screen is heard. The 🔊 button in the top bar (or <kbd>M</kbd>) mutes everything; the choice is remembered. Browsers only allow sound after your first click or key press.
* The header has the buttons **Tasks**, **Reports** and **Activity** (no counters, so the layout never jumps). Click one to open the **full list** (the *Activity* tab is open from the start; click it again to close) under the header – tabs *Tasks* (running ones first, then finished ones with who did them and how long it took), *Reports* (the report texts) and *Activity* (everything that happened in the session – your requests, thoughts, messages, tool calls, sub-agents, reports – **newest first**, with the person who did it; the 🕘 button opens the same tab). Click the button again to close the list.
* The header's **📜 Summary** button is always there: it lays the **last summary** of the session on a sheet of paper in the middle of the screen (scrollable). While no run has finished yet it is made from what is known so far – the last request, the last closing message the monitor saw and the tasks done.
* When a session has **finished all its work** the **director reads the summary aloud** in their speech bubble – the main agent's closing message, **two lines at a time, five seconds per bubble** (at most 30 bubbles) – and only goes home after the last line (the staff still leave first). Its button in the room column gets a **blinking blue dot in its top-left corner** until the summary is read. Stepping into a room whose session is done lays a **sheet of paper** in the middle of the screen: what was asked, the main agent's closing message (with its lists and code formatting), how long it took and every sub-agent task with its report (tool calls are summed up in one line). The paper scrolls. The header's **📜 Summary** button brings it back at any time (until a run has finished it is made from what is known so far).
* **Rooms are not closed after a few minutes** – a session stays in the room column on the right (working sessions on top, then the newest; scrollable; <kbd>1</kbd>–<kbd>9</kbd> and the arrow keys follow that order) (and its dot keeps blinking) until *you* **release** it, or until it has **stood still for an hour**, when it is released by itself (a room whose paper is open is left alone). The paper has a **Release room** button, and closing the paper asks "Release this room?" (*Keep the room* / *Release room*). Releasing only takes the room **off the list**: nothing is deleted, and when you **continue the session in Claude Code** the room opens again by itself. Released rooms are remembered across page reloads, and a session that was released – by you or by the one-hour rule – comes back the moment it does something again.
* Each room button shows the project, a short session name and the status.
* The room is named after the folder the session was **launched in** – a `cd` into a sub folder does not rename it.
* Every room has **1–2 cats** that hop in through a random window (every window has two sashes: one stays closed, the other one always stands open outwards – that is the way in; which one is open – left or right – is random per window), wander, groom, nap on the sofa / director's desk / a patch of sun and hop out again through another random window. Click a cat to follow it.
* **Names:** the 👥 Names button takes a list of names (one per line). The list always comes first: a name remembered from an earlier run is only reused if it is still on the list. The director and every staff member get a random one – unique inside a room, kept across refreshes, reused for every room and run. When the list runs out, common English names are used.
* The **director is always there** while a session works – also when you open or refresh the page in the middle of a run, or while only background sub-agents are still running.
* **Day / night** follows the system clock: sky gradient, sun and moon, stars, sun-beams, warm lights that switch on in every room when it gets dark (lamps, wall sconces, window glow). Press `N` (or the clock button) to preview day / dusk / night, or open the app with `?hour=21.5`.
* Bottom bar = **room switcher** (camera flies between rooms). Click a character to follow it and read its log.

No configuration is needed – the app simply reads what the agents already write:

* **Claude Code** – tails `~/.claude/projects/**.jsonl` (including `<session>/subagents/agent-*.jsonl`).
* **Codex / ChatGPT** (CLI, desktop app, IDE) – tails `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`; thread names come from `~/.codex/session_index.jsonl`.
* **OpenCode 2.x** – reads `~/.local/share/opencode/opencode.db` (SQLite, opened read-only; needs Node 22.5+ for `node:sqlite`). Sub-agent sessions (`parent_id`) show up as sub-agents of their parent room. Older OpenCode 1.x databases are not supported.

Each room button shows the logo of its provider instead of a colour swatch.

## Run

From npm (no checkout needed, Node 20+):

```bash
npx @thnonl/agent-workspace              # opens http://localhost:4173
npx @thnonl/agent-workspace --port 8080 --no-open
npm i -g @thnonl/agent-workspace         # then just: agent-workspace
```

Options: `-p, --port <n>` (or `$PORT`), `--host <ip>` (default `127.0.0.1`; use `0.0.0.0` to open the page from another device on your network), `--no-open`, `-h, --help`. The page is served on your machine only unless you pass `--host`.

From a checkout:

```bash
npm install
npm run dev          # http://localhost:5173  (Vite + transcript monitor)
```

Production:

```bash
npm run build
npm start            # http://localhost:4173  (static files + SSE monitor)
```

Publishing: `npm publish` (the `prepack` script builds `dist/` first; only `dist/` and `server/` are shipped, there are no runtime dependencies). Check the contents with `npm pack --dry-run`.

If no session is running the app starts a **demo** with three scripted sessions so you can see everything. Force it with `?demo`, disable with `?nodemo`, or use the ▶ Demo button / `D`.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Folder to watch |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Used to derive the folder above |
| `CODEX_HOME` | `~/.codex` | Codex home (rollouts are read from `sessions/`) |
| `OPENCODE_DB` | `~/.local/share/opencode/opencode.db` | OpenCode database |
| `SESSION_WINDOW_MIN` | `30` | A session gets a room while it was active within this many minutes |
| `PORT` | `4173` | Port of `npm start` |

## Controls

| Input | Action |
| --- | --- |
| `←` `→` / `[` `]` / `1`–`9` | switch room |
| drag / wheel | rotate / zoom the camera |
| click a character | follow it + show its log (`Esc` to release) |
| `R` | reset camera |
| `D` | toggle demo |
| `N` | time of day: auto → day → dusk → night |
| `?` | help |

## How it works

```
~/.claude/projects/<project>/<session>.jsonl               main agent transcript
~/.claude/projects/<project>/<session>/subagents/*.jsonl   one file per sub-agent (+ .meta.json)
        │  server/monitor.mjs  – tails the files (500 ms), keeps per-session state
        ▼
   normalised events: session · agent_start · agent_say · agent_done      (SSE: /api/events)
        │  src/live/connection.ts        ← or src/demo/simulator.ts for the demo
        ▼
   zustand store  ──►  React Three Fiber scene  +  HTML overlay (bubbles, panels)
```

* `Agent`/`Task` `tool_use` → sub-agent spawned = a new task. Its `tool_result` (foreground agents) or `<task-notification>` (background agents) → task done.
* The main agent's other `tool_use` blocks → tasks too (one task per call; a sub-agent's tool calls are tasks as well, done by other people than the one who owns the run; when more than 40 calls wait for a free person the oldest are dropped). Its prompt, thinking and messages are voiced by the director.
* An assistant message with a non-`tool_use` stop reason, or a `turn_duration` system entry → the main turn is over. When the turn is over and no task is left the office closes.
* Stale sessions (no writes for a while) are released automatically so nobody sits at a desk forever.

### Code map

| Path | What |
| --- | --- |
| `server/monitor.mjs` | transcript watcher → events (unit tests: `npm test`) |
| `server/codex.mjs`, `server/opencode.mjs` | Codex rollout parser, OpenCode database reader |
| `server/app.mjs` | static files + `/api` (the web server) |
| `server/index.mjs` | command line entry (`agent-workspace`): monitor + web server + opens the browser |
| `src/world/layout.ts` | procedural room generator (fan / bench seating facing the director, door, windows, props, wall decor, floor clutter) + nav grid |
| `src/world/nav.ts` | A* path finding with line-of-sight smoothing |
| `src/world/appearance.ts` | random cute characters (gender, hair, outfits, accessories) |
| `src/scene/character.ts` | chibi character built from primitives |
| `src/store.ts` | people, tasks and the office rules: hiring, taking turns, handing out tasks, closing time (`tick` runs every 250 ms) |
| `src/sim/actor.ts` | per-character state machine (enter → sit → unpack → type → hand over report → wait / break → pack → leave) |
| `src/sim/cat.ts`, `src/scene/catModel.ts`, `catMesh.ts`, `CatView.tsx` | the office cats: behaviour, skinned model + fur colouring, bone animation |
| `?catlab&seed=1&count=6&pose=sit` | dev turntable to inspect cats (`pose`: idle, walk, sit, groom, sleep, purr, stretch) |
| `src/env.ts`, `src/scene/glow.ts` | time-of-day model (light, sky) and materials that glow when the lights are on |
| `src/scene/*` | room, furniture (`furniture.tsx`, `props.tsx`, `officeProps.tsx`), walls, camera, lights |
| `src/scene/bake.ts`, `StaticBake.tsx` | merge static primitives into a few meshes (≈1/3 of the draw calls); the baked-away sources are no longer walked by three |
| `src/scene/matrixWalk.ts` | switches the per-frame matrix update of a subtree off (baked sources, rooms that are off screen) |
| `src/ui/*` | HUD, room switcher, agent panel, speech bubbles |

Stack: React 19, Vite, TypeScript, three.js, @react-three/fiber, zustand.
