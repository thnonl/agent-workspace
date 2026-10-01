# 🏢 Agent Workspace

A cute, isometric 3D office that shows your **Claude Code**, **Codex** and **OpenCode** sessions at work, in real time.

![Agent Workspace tour: rooms for every session, coffee breaks, cats, a commit party, day and night, weather and seasons](https://raw.githubusercontent.com/thnonl/agent-workspace/main/docs/demo.gif)

## Highlights

<table>
  <tr>
    <td width="50%"><img alt="A request arrives, the director briefs the team and the staff get to work" src="https://raw.githubusercontent.com/thnonl/agent-workspace/main/docs/gifs/work.gif"><br><b>Real work, played out</b><br>The director takes the request, staff members pick up the tasks and type away.</td>
    <td width="50%"><img alt="Three sessions, three rooms, the camera flies between them" src="https://raw.githubusercontent.com/thnonl/agent-workspace/main/docs/gifs/rooms.gif"><br><b>One room per session</b><br>Claude Code, Codex and OpenCode side by side. Switch with <kbd>1</kbd>–<kbd>9</kbd> or the arrow keys.</td>
  </tr>
  <tr>
    <td><img alt="Staff cooking noodles, getting a drink, reading, watching the fish" src="https://raw.githubusercontent.com/thnonl/agent-workspace/main/docs/gifs/breaks.gif"><br><b>Coffee breaks</b><br>Nothing to do? Cook noodles, grab a drink, read a book or watch the fish.</td>
    <td><img alt="A cat hops in through the window, plays with a toy and scratches a post" src="https://raw.githubusercontent.com/thnonl/agent-workspace/main/docs/gifs/cats.gif"><br><b>Office cats</b><br>They hop in through the windows, play with toys and nap on the sofa.</td>
  </tr>
  <tr>
    <td><img alt="git commit and git push make the director's desk burst into confetti" src="https://raw.githubusercontent.com/thnonl/agent-workspace/main/docs/gifs/celebrate.gif"><br><b>Commit &amp; push = party</b><br>Sparkles for a commit, confetti for a push, a shower when the whole run is done.</td>
    <td><img alt="The agent asks a question and the director shows an amber bubble" src="https://raw.githubusercontent.com/thnonl/agent-workspace/main/docs/gifs/ask.gif"><br><b>It tells you when it needs you</b><br>A pulsing ❓ bubble stays until you answer in your agent.</td>
  </tr>
  <tr>
    <td><img alt="Sky and lights change from morning to night" src="https://raw.githubusercontent.com/thnonl/agent-workspace/main/docs/gifs/daynight.gif"><br><b>Day and night</b><br>The light follows your system clock; the lamps switch on at dusk.</td>
    <td><img alt="Rain, thunderstorm, snow, fog, Christmas, Tết and Halloween" src="https://raw.githubusercontent.com/thnonl/agent-workspace/main/docs/gifs/weather.gif"><br><b>Weather and seasons</b><br>Rain, storms, snow, fog – plus Christmas, Tết and Halloween decorations.</td>
  </tr>
</table>

## Quick start

Needs [Node.js](https://nodejs.org) 20 or newer. Start a Claude Code (or Codex / OpenCode) session anywhere, then run:

```bash
npx @thnonline/agent-workspace
```

Your browser opens on <http://localhost:4173> and every running session shows up as a room. Stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd>. Nothing has to be configured.

Rooms load lazily (the one you look at first, then the other working sessions one at a time) and the rooms you are not looking at run at a very low frame rate, so many sessions stay cheap. A room that has been off screen, empty and idle for a few minutes is taken out of the scene again (it comes back when you open it or its session starts working), the frame rate drops further when nobody touches the page, and a hidden tab draws nothing. The transcript monitor itself only runs while a browser is connected (it stops 30 s after the last one leaves).

Want it as a command that is always there?

```bash
npm i -g @thnonline/agent-workspace
agent-workspace                    # from then on, in any terminal
```

**Updating:** `npx` keeps a copy in its cache after the first run and does not always fetch a newer release. To be sure you run the newest version, add the `@latest` tag:

```bash
npx @thnonline/agent-workspace@latest          # always the newest release
npm update -g @thnonline/agent-workspace       # update a global install
npx clear-npx-cache                            # if npx still starts an old version
```

A copy installed globally or inside a project's `node_modules` is used as it is – `npx` never updates it. To remove the global install: `npm rm -g @thnonline/agent-workspace`.

* Every **session** (Claude Code, Codex or OpenCode) gets its own **room** (each with a different colour theme, layout, furniture and decorations).
* **Characters are not agents.** Every character – random gender (four boys to every girl), a current hairstyle, outfit, hat and colours, and a bag (backpack, roll-top, sling or messenger bag across the body, chest bag, tote, briefcase or a small suitcase on wheels) – is a person of the office; the work they do comes from the session:
  * The **director** sits at the big executive desk for as long as the session works. They voice the **main agent** (the incoming prompt 📥, thinking 💭, messages 💬, "delegating…") and are the last to leave.
  * Every **task** is done by one **staff member**: a **sub-agent** run (Agent / Task tool), or **one tool call** – of the main agent *or of a sub-agent* (every call, delegating ones included, is its own short task done by the next person in line, so the calls are spread over the staff and each one is listed in the task list). The staff member sits at their own desk **facing the director**, takes the laptop out of the bag, opens it and types; their bubbles show the task's thinking, messages and tool calls (`Reading foo.ts`, `$ npm test`, …) 🔧.
  * The staff **take turns** (strict rotation – nobody gets two tasks in a row while somebody else is free): a new task hires a person until the team has 3 members (up to 6 when everybody is busy, one newcomer per 6 s); after that the task goes to whoever finished a task longest ago – including people who already went home – so nobody ends up doing everything.
* When a sub-agent task is done, its staff member walks to the **director's desk**, hands over the report (the pile on the desk grows) and goes back. **Nobody leaves after a task**: they stay at their desk, sit on the sofa or pet a cat until the next task comes round. The same goes for the director while nobody needs them.
* When the session has **no work left** (turn over, no sub-agent running) everybody packs up and **goes home one after another** – the staff first, the director last. New work → they walk back in.
* Rooms are procedurally furnished like a real office: **exactly 6 staff desks** (one per possible staff member) fanned out around the director (or long bench desks with dividers), meeting table, lounge, pantry, copier, file cabinets, server rack, vending machine, kanban / cork boards, wall TV dashboard, cluttered desks and scattered paper.
* **Speech bubbles stay** until the character does something else (after a few seconds they shrink to a compact form). A bubble always sits right above its own character – it is never moved aside, so two bubbles can overlap (the nearer character is drawn on top); the little arrows of all bubbles are drawn underneath all bubbles, so an arrow never covers somebody else's text. Breaks talk too – the thought appears **the moment the character decides** on the break, while it is still in the chair –, as **thought clouds** (💭 shape): "Reading “Clean Code”" 📖, "Pouring a cold glass of water" 🥤, "Watering the plants" 🪴, "Waiting for the next task" ⏳, "Time to go home. Bye!" 👋 …
* Whoever has **nothing to do** takes a break: walks around the office, sits on the sofa, stands behind a working colleague to watch, looks out of the window, pets one of the office cats – or does something in the office: **gets a drink** at the water cooler / coffee machine, **reads a book** from the bookshelf, **watches the fish** in the aquarium, **washes their face** at the sink, **waters the plants** with a watering can, **cooks noodles** on the kitchenette stove and **eats them right there** from a bowl, or **walks over to a colleague's desk for a chat** (they take turns, the colleague nods along). Or **sits down at the round table** with a coffee or a bowl of noodles – with company, they chat in turns and look at whoever speaks – or **goes to the toilet**: a quick dash (fast walk) or a long sit, scrolling the phone, reading a book or just sitting, then **washes their hands** at the sink next to the cubicle. Or simply stays in the chair. Breaks are long (roughly 15–40 s) and far apart (20 s or more between two of them), so nobody hops from one thing to the next.
* A new task does **not** send anybody back to their desk: whoever is on a break (drinking, reading, on the sofa, cooking…) **works on it where they are** and then **carries on with the break**; a sub-agent task still ends with the walk to the director, after which they return to what they were doing. Somebody with nothing to do shows **no speech bubble** (just the name tag). Chat lines, greetings and goodbyes are shown as speech bubbles, plans for a break as thought clouds. Every activity has a long pool of phrases (`src/sim/phrases.ts`: greetings by time of day, break thoughts, cooking / eating lines, goodbyes, report lines, 30+ small-talk scripts) that never repeats the same line twice in a row.
* **Furniture variety:** the desks come as plain, **L-shaped** (a return on one side), **U-shaped**, **oval** or with a **pinboard shelf**; every room has a **toilet cubicle** in a back corner (low partitions, a swinging door with a free / occupied dot, tiled floor, the sink with its mirror right next to it) and, almost always, a **round table** with four chairs.
* **Sound effects** (quiet, synthesised in the browser, no music, no files): the door, key clicks while somebody types, a pop for every speech bubble, a chime when a session is done, paper rustling, water, sipping, page turns, sizzling noodles, chopsticks, chat murmur, a meow. Only the room on screen is heard. The 🔊 button in the top bar (or <kbd>M</kbd>) mutes everything; the choice is remembered. Browsers only allow sound after your first click or key press.
* The header has the buttons **Tasks**, **Reports** and **Activity** (no counters, so the layout never jumps). Click one to open the **full list** (closed from the start; the buttons are the tabs – click the open one again to close it) under the header – tabs *Tasks* (running ones first, then finished ones with who did them and how long it took), *Reports* (the report texts) and *Activity* (everything that happened in the session – your requests, thoughts, messages, tool calls, sub-agents, reports – **newest first**, with the person who did it). Click the button again to close the list.
* The header's **📜 Summary** button is always there: it lays the **last summary** of the session on a sheet of paper in the middle of the screen (scrollable). While no run has finished yet it is made from what is known so far – the last request, the last closing message the monitor saw and the tasks done.
* **When the agent asks you something** (Claude Code's `AskUserQuestion` / plan approval, OpenCode's question tool) the director gets a persistent amber **❓ "needs your input" bubble** with a pulsing glow that stays until you answer, raises a hand now and then, a ❓ badge pulses on the session's card and header, a two-note chime plays, and a hidden tab's title starts with "❓". Codex is not supported (its rollout parser only reads finished items).
* When a session has **finished all its work** the **director announces it** in a speech bubble – one or two short phrases picked from a long pool (there are separate pools for a big run and for a run in which some tasks failed); the closing message itself is not read out, it is on the summary paper – and only goes home after the last line (the staff still leave first). Its button in the room column gets a **blinking blue dot in its top-left corner** until you have read the summary (closing the paper marks it read; it does not lay itself down again until the session has worked again). When the room is the one on screen, the **paper opens by itself once everybody has left the office** (the director goes last); if you are looking at another room it waits for you. Stepping into a room whose session is done lays a **sheet of paper** in the middle of the screen: what was asked, the main agent's closing message (with its lists and code formatting), how long it took and every sub-agent task with its report (tool calls are summed up in one line). The paper scrolls. The header's **📜 Summary** button brings it back at any time (until a run has finished it is made from what is known so far).
* **Rooms are not closed after a few minutes** – a session stays in the room column on the right (in the order the sessions showed up – it never reshuffles; scrollable; <kbd>1</kbd>–<kbd>9</kbd> and the arrow keys follow that order) until *you* **release** it, or until it has **stood still for an hour**, when it is released by itself (a room whose paper is open is left alone). The paper has a **Release room** button,, and **Release idle rooms** under the list releases every room that is not working (after a confirmation). Releasing only takes the room **off the list**: nothing is deleted, and when you **continue the session in its agent** the room opens again by itself. Released rooms are remembered across page reloads, and a session that was released – by you or by the one-hour rule – comes back the moment it does something again.
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

```bash
agent-workspace                          # or: npx @thnonline/agent-workspace@latest
agent-workspace --port 8080              # another port
agent-workspace --no-open                # do not open the browser
agent-workspace --host 0.0.0.0           # also reachable from other devices on your network
```

| Option | Meaning |
| --- | --- |
| `-p, --port <n>` | Port to listen on (default `4173`, or `$PORT`) |
| `--host <ip>` | Address to listen on (default `127.0.0.1`: this machine only) |
| `--no-open` | Do not open the browser |
| `-h, --help` | Show the options |

The page is only reachable from your own machine unless you pass `--host` – it shows what your agents are doing, so share it deliberately.

### From a checkout (development)

```bash
# in a checkout of the repository
npm install
npm run dev          # http://localhost:5173  (Vite + transcript monitor, hot reload)
npm run build && npm start   # production build on http://localhost:4173
npm test             # monitor unit tests
```

Publishing: `npm publish` (the `prepack` script builds `dist/` first; only `dist/` and `server/` are shipped, there are no runtime dependencies). Check the contents with `npm pack --dry-run`.

`npm run dev` starts a **demo** with three scripted sessions when no session is running, so you can see everything. Force it with `?demo`, disable with `?nodemo`, or press `D`. A published/production build never starts the demo by itself and hides the ▶ Demo button; `?demo` and `D` still work there.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Folder to watch |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Used to derive the folder above |
| `CODEX_HOME` | `~/.codex` | Codex home (rollouts are read from `sessions/`) |
| `OPENCODE_DB` | `~/.local/share/opencode/opencode.db` | OpenCode database |
| `SESSION_WINDOW_MIN` | `30` | A session gets a room while it was active within this many minutes |
| `PORT` | `4173` | Port of the web page (same as `--port`) |
| `CONTEXT_WINDOW_TOKENS` | *(from the model list)* | Forces the context window of every session without a reported size, e.g. `1m` or `200k` (the Settings dialog can do the same per browser) |
| `OPENCODE_CONFIG` | `~/.config/opencode/opencode.json` | OpenCode config; its `provider.<id>.models.<id>.limit.context` gives the context window of each model |
| `AGENT_WORKSPACE_DB` | `~/.agent-workspace/settings.db` | SQLite file with your settings (names, progress, mute, music … – quality, weather and decorations stay in the browser). Needs Node 22.5+; on older Node the settings stay in the browser (localStorage). Old localStorage values are moved into the file on first start |

## Controls

| Input | Action |
| --- | --- |
| `←` `→` / `[` `]` / `1`–`9` | switch room |
| drag / wheel | rotate / zoom the camera |
| click a character | follow it + show its log (`Esc` to release) |
| `R` | reset camera (position, tilt and zoom) |
| `D` | toggle demo |
| `N` | time of day: auto → day → dusk → night |
| `W` | weather outside: clear → cloudy → rain → storm → snow → fog |
| `K` | lo-fi music on / off (`M` mutes the sound effects and the ambience) |
| `P` | save a photo of the office (PNG) |
| `C` | screensaver mode: the buttons fade out and the camera tours the rooms; a click or `Esc` leaves it |
| `L` | level, stats and achievements |
| `I` | floating window (picture-in-picture): the whole office moves into a small always-on-top window – like the screensaver (no buttons) but the camera holds still, it starts in the room that was on screen, moves on by itself to the room that was active most recently once that one has had nothing to do for 8 s (it stays put while no room is working), and has no photo button; the tokens used out of the context window show in its corner. Close the window, press `I` or use *Bring it back* to return. Needs Chrome or Edge 116+ on https or localhost |
| `?` | help |

Click the coffee machine, the water cooler, the fish tank, the printer or the vending machine and they react; the little radio on the director's desk starts the music. **Settings** (gear button) has the graphics quality (low / medium / high), the weather, the decorations (Halloween, Christmas, Tết; `auto` follows the date) and the sound switches. `?weather=rain` and `?season=tet` force a value for one page load.

### Life in the office

* **Looks:** soft contact shadows under furniture, people and cats; glow around lamps and pools of light on the floor at night; dust drifting through the window light by day; rain, storms, snow and fog outside (the sky, the sun and the room light follow the weather); festive decorations by date.
* **Moments:** when the agent finishes a run the office cheers and confetti falls (a long run also gets a cake on the director's desk); a `git commit` gives a shower of sparkles, a `git push` a confetti cannon.
* **Cats:** the meows are real recordings (public/sfx/meow, ~57 KB for 13 clips, credits in `CREDITS.txt`); each cat has its own pitch, the clip, pitch glide and loudness change from meow to meow and now and then a cat meows twice. Put new downloads into `assets-src/meow/` and run `npm run meow` (needs ffmpeg): every file is cut into its single meows, filtered, levelled and re-encoded. Without the clips the synthesised meow is used.
* **Sound:** generative lo-fi music (mood follows the time of day and the weather), crickets at night – all synthesised, no audio files.
* **Context window:** every session button (and the room header) shows how full the main agent's context is, e.g. `554k / 1M · 55%`, green below 60 %, amber up to 85 %, red above. Claude Code: input + cache + output tokens of the last message; Codex and OpenCode (with limits in its config) report their window size, Claude models come from a built-in table (1M for Fable, Mythos, Opus 4.6+, Sonnet 4.6+; 200k for the rest), Codex models from its `models_cache.json`. Only a model nobody lists is guessed (200k, 1M once a session has outgrown that) – Settings → Context window can correct that.
* **Progress:** finished tasks, reports, runs, commits and pushes earn experience; levels unlock extra cats, achievements show up as toasts. It is all kept in this browser (real sessions only).

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
| `?wardrobe&seed=1&count=12&cols=6` | dev turntable for people: any look field can be forced (`top=blazer&hat=fedora`, comma lists are handed out in turn), `back=1` for the back, `&laptops` shows every laptop model |
| `src/env.ts`, `src/scene/glow.ts` | time-of-day model (light, sky, cloud cover) and materials that glow when the lights are on |
| `src/scene/fx.ts`, `RoomAO.tsx`, `RoomLightFx.tsx` | soft sprites; floor shadows of the furniture (one merged mesh per room); lamp pools, halos and window dust |
| `src/scene/CelebrationFx.tsx`, `src/sim/celebrate.ts` | confetti / sparkles / steam (one pooled `Points`), the cake; the queue the store and the props feed |
| `src/scene/SeasonDecor.tsx`, `src/season.ts` | Halloween, Christmas and Tết decorations and the date rules |
| `src/weather.ts`, `src/ui/WeatherLayer.tsx` | weather model; rain / snow canvas behind the scene and the lightning |
| `src/music.ts`, `src/audio.ts` | Web Audio sound effects; lo-fi music engine, rain and crickets |
| `src/progress.ts`, `src/ui/ProgressDialog.tsx` | experience, levels, achievements |
| `src/photo.ts`, `src/ui/Settings.tsx`, `src/prefs.ts` | photo export, settings dialog, persisted preferences |
| `src/scene/*` | room, furniture (`furniture.tsx`, `props.tsx`, `officeProps.tsx`), walls, camera, lights |
| `src/scene/bake.ts`, `StaticBake.tsx` | merge static primitives into a few meshes (≈1/3 of the draw calls); the baked-away sources are no longer walked by three |
| `src/scene/matrixWalk.ts` | switches the per-frame matrix update of a subtree off (baked sources, rooms that are off screen) |
| `src/ui/*` | HUD, room switcher, agent panel, speech bubbles |

Stack: React 19, Vite, TypeScript, three.js, @react-three/fiber, zustand.

## License

[MIT](LICENSE) © Nam Thai. Bundled third-party software (React, three.js, react-three-fiber, drei, zustand and a few small helpers, all MIT) is listed in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt); run `npm run licenses` after changing dependencies. Unofficial – not affiliated with Anthropic.
