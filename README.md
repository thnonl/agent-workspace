# 🏢 Agent Workspace

> **Work with fun. Costs zero tokens.** 🎉

A cute, isometric 3D office that shows your **Claude Code**, **Codex** and **OpenCode** sessions at work, in real time.

## ⚡ Install in one line

Needs [Node.js](https://nodejs.org) 20 or newer. Start a Claude Code, Codex or OpenCode session anywhere, then run:

```bash
npx @thnonline/agent-workspace@latest
```

Your browser opens on <http://localhost:4173> and every running session shows up as a room. Stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd>. Nothing to configure. Other ways to run it, and how to update: [Run](#run).

## 📑 Table of contents

- [⚡ Install in one line](#-install-in-one-line)
- [Highlights](#highlights)
- [How it works](#how-it-works)
- [Life in the office](#life-in-the-office)
- [Controls](#controls)
- [Run](#run)
  - [Environment variables](#environment-variables)
- [Development](#development)
- [License](#license)

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

## How it works

The app reads what your agents already write, so there is nothing to set up:

* **Claude Code** – tails `~/.claude/projects/**.jsonl`, sub-agents included.
* **Codex** – tails `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
* **OpenCode 2.x** – reads `~/.local/share/opencode/opencode.db` read-only (needs Node 22.5+).

Every session gets its own **room**. The characters are not the agents but the staff of the office, and they play out the work:

* The **director** voices the main agent: your prompt 📥, its thinking 💭 and messages 💬.
* Every **task** – a sub-agent run or a single tool call – is done by a **staff member** at their own desk, who hands the report to the director when a sub-agent finishes. The staff take turns, so nobody does everything (3 people, up to 6 when all are busy).
* With nothing to do, people take **breaks**: a drink, a book, the fish tank, noodles, a chat, the sofa, a cat. When the session has no work left everybody **goes home** and a **summary** paper opens (the 📜 Summary button brings it back).
* When the agent **asks you something**, the director shows a pulsing ❓ bubble until you answer (Codex does not report questions).
* A room stays in the list until you **release** it, or until it has been idle for an hour; continuing the session brings it back.
* Only the room on screen is drawn at full speed, the others stand still, and a hidden tab draws nothing. The monitor stops 30 s after the last browser leaves.

## Life in the office

* **Looks:** soft shadows, lamp glow at night, dust in the sunbeams, rain, storms, snow and fog, and decorations by date (Christmas, Tết, Halloween).
* **Day and night** follow your system clock (<kbd>N</kbd> previews them, or open `?hour=21.5`).
* **Moments:** the office cheers when a run finishes; `git commit` makes sparkles, `git push` a confetti cannon.
* **Cats:** one or two per room, hopping in through the windows. Click one to follow it.
* **Sound:** quiet synthesised effects and optional lo-fi music, no audio files to download.
* **Context window:** every session button shows how full the main agent's context is, e.g. `554k / 1M · 55%` (green below 60 %, amber below 85 %, red above). *Settings → Context window* corrects the guess when a model is unknown.
* **Names and progress:** the 👥 Names button takes your own list of names; finished tasks earn XP, levels and achievements (kept in this browser).

## Controls

| Input | Action |
| --- | --- |
| `←` `→` / `[` `]` / `1`–`9` | switch room |
| drag / wheel | rotate / zoom the camera |
| click a character | follow it and show its log (`Esc` to release) |
| `R` | reset the camera |
| `D` | toggle the demo |
| `N` | time of day: auto → day → dusk → night |
| `W` | weather: clear → cloudy → rain → storm → snow → fog |
| `K` / `M` | lo-fi music on / off; mute the sound effects |
| `P` | save a photo of the office (PNG) |
| `C` | screensaver: the buttons fade out and the camera tours the rooms (click or `Esc` to leave) |
| `L` | level, stats and achievements |
| `I` | floating always-on-top window (picture-in-picture); needs Chrome or Edge 116+ on https or localhost |
| `?` | help |

Click the coffee machine, the water cooler, the fish tank, the printer or the vending machine and they react. **Settings** (gear button) has the graphics quality (low / medium / high), the weather, the decorations and the sound switches; `?weather=rain` and `?season=tet` force a value for one page load.

## Run

Want it as a command that is always there?

```bash
npm i -g @thnonline/agent-workspace
agent-workspace                    # from then on, in any terminal
```

| Option | Meaning |
| --- | --- |
| `-p, --port <n>` | Port to listen on (default `4173`, or `$PORT`) |
| `--host <ip>` | Address to listen on (default `127.0.0.1`: this machine only; `0.0.0.0` makes it reachable from your network) |
| `--no-open` | Do not open the browser |
| `-h, --help` | Show the options |

The page is only reachable from your own machine unless you pass `--host` – it shows what your agents are doing, so share it deliberately.

**Updating:** keep the `@latest` in the `npx` command: without it `npx` can reuse an older copy from its cache. `npm update -g @thnonline/agent-workspace` updates a global install, `npx clear-npx-cache` helps if `npx` still starts an old version, and `npm rm -g @thnonline/agent-workspace` removes the global install. A copy inside a project's `node_modules` is used as it is.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Folder to watch |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Used to derive the folder above |
| `CODEX_HOME` | `~/.codex` | Codex home (rollouts are read from `sessions/`) |
| `OPENCODE_DB` | `~/.local/share/opencode/opencode.db` | OpenCode database |
| `OPENCODE_CONFIG` | `~/.config/opencode/opencode.json` | OpenCode config; its model limits give the context windows |
| `SESSION_WINDOW_MIN` | `30` | A session gets a room while it was active within this many minutes |
| `PORT` | `4173` | Port of the web page (same as `--port`) |
| `CONTEXT_WINDOW_TOKENS` | *(from the model list)* | Forces the context window of sessions without a reported size, e.g. `1m` or `200k` |
| `AGENT_WORKSPACE_DB` | `~/.agent-workspace/settings.db` | SQLite file with your settings (names, progress, mute, music). Needs Node 22.5+; on older Node the settings stay in the browser |

## Development

```bash
npm install
npm run dev                  # http://localhost:5173  (Vite + transcript monitor, hot reload)
npm run build && npm start   # production build on http://localhost:4173
npm test                     # monitor unit tests
```

`npm run dev` starts a **demo** with three scripted sessions when no session is running. Force it with `?demo`, disable it with `?nodemo`, or press `D`; a production build never starts it by itself. Dev only: `?perf` adds a small statistics panel (fps, CPU and GPU ms per frame, draw calls, programs, long tasks, heap). In any build, `?catlab` and `?wardrobe` open turntables for the cats and the characters.

Publishing: `npm publish` (the `prepack` script builds `dist/`; only `dist/` and `server/` are shipped). Check the contents with `npm pack --dry-run`. After adding cat sound clips to `assets-src/meow/`, run `npm run meow` (needs ffmpeg).

Stack: React 19, Vite, TypeScript, three.js, @react-three/fiber, zustand.

## License

[MIT](LICENSE) © Nam Thai. Bundled third-party software (React, three.js, react-three-fiber, drei, zustand and a few small helpers, all MIT) is listed in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt); run `npm run licenses` after changing dependencies. Unofficial – not affiliated with Anthropic.
