# claude-statusline-todo

A tiny, zero-dependency [Claude Code](https://docs.claude.com/en/docs/claude-code) status line.

- **Left** — checkbox progress from your project's `docs/TODO.md` (`done/total` + percent), plus the current **git branch** when it isn't `main`/`master`.
- **Right** — a **context-window gauge** (`▓░░░░ 8%`), the current **model · effort**, color-coded, pinned to the right edge.
- **Optional** — **session cost** (`$0.01`) and a **usage %** indicator (e.g. the 5-hour rate-limit window) from a JSON URL you provide.

```
📋 4/31 │ 13%    ⎇ feature-x              ▓░░░░ 8% │ $0.01 │ 17% │ Opus 4.8 · high
└── docs/TODO.md    └ branch              context ┘   cost ┘ usage ┘  model ┘  effort ┘
```

Colors are quiet by default and only shout on anomalies: the usual `Opus · high` is uncolored, while a different model or a heavier/lighter effort lights up so you catch it with peripheral vision.

## Why

Claude Code shows the model and effort only in the startup banner, which scrolls away. This keeps that info — plus your TODO progress and (optionally) how much of your rate limit you've burned — always visible in the status line.

## Install

> **Fastest path:** hand [`README-agent.md`](./README-agent.md) to Claude Code and say *"set up this status line"*. It does the steps below for you.

Manual:

1. Put `statusline.cjs` somewhere stable, e.g. `~/.claude/statusline-todo.cjs`:
   ```bash
   cp statusline.cjs ~/.claude/statusline-todo.cjs
   ```
2. Add a `statusLine` entry to your Claude Code settings. Use an **absolute** path.
   - User-wide (all projects without their own): `~/.claude/settings.json`
   - Single project: `<project>/.claude/settings.json` (a project setting overrides the user one)
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node /home/you/.claude/statusline-todo.cjs"
     }
   }
   ```
3. Add a `docs/TODO.md` with `- [ ]` / `- [x]` lines to any project where you want the task counter. The line refreshes automatically — no restart needed.

## Configuration

All optional, via environment variables (set them in the `env` block of the same `settings.json`):

| Variable | Default | Meaning |
|---|---|---|
| `STATUSLINE_TODO` | `docs/TODO.md` | TODO file path (relative to the project, or absolute). |
| `STATUSLINE_USAGE_URL` | _(unset → off)_ | URL of a JSON usage report. When unset (and no file source), the usage segment is hidden. |
| `STATUSLINE_USAGE_FILE` | _(unset → off)_ | Read usage from a **local JSON file** instead of a URL (no network). `1`/`true`/`on` → `~/.claude/usage.json`; any other value → that path (`~` is expanded). Takes priority over `STATUSLINE_USAGE_URL`. |
| `STATUSLINE_USAGE_WARN` | `70` | Usage % at which the number turns yellow. |
| `STATUSLINE_USAGE_CRIT` | `90` | Usage % at which it turns red. |
| `STATUSLINE_USAGE_TTL` | `90` | Seconds before the cached usage value is refreshed (in the background). |
| `STATUSLINE_CONTEXT` | `1` (on) | Context-window gauge (`▓░░░░ NN%`) from `context_window.used_percentage` on stdin. Set `0`/`off`/`false` to hide it. |
| `STATUSLINE_CONTEXT_WARN` | `70` | Context % at which the gauge turns yellow. |
| `STATUSLINE_CONTEXT_CRIT` | `90` | Context % at which it turns red. |
| `STATUSLINE_COST` | _(unset → off)_ | Session cost (`$N.NN`) from `cost.total_cost_usd`. Set `1`/`true`/`on` to show it. |
| `STATUSLINE_RESERVE` | `3` | Columns kept free at the right edge (Claude Code trims slightly early). |
| `STATUSLINE_BRANCH` | `1` (on) | Set `0`/`off`/`false` to hide the git branch segment. When on, the branch shows for every branch except `main`/`master`. |

### Git branch

Shown on the left, after the TODO counter, as `⎇ <branch>` — but only when the branch is **not** `main` or `master` (so the common case stays clean and a feature branch stands out). The branch is read straight from `.git/HEAD` (walking up from the project dir, and following `.git` worktree pointers); it never shells out, so rendering stays instant. A detached HEAD shows the short commit SHA.

### Context window

Shown on the right as a 5-cell gauge plus percent (`▓░░░░ 8%`), one cell per 20%. It reads `context_window.used_percentage` — the value Claude Code pre-computes and passes on stdin — so there's no transcript parsing and no network. It stays quiet (dim) until `STATUSLINE_CONTEXT_WARN` (yellow) and `STATUSLINE_CONTEXT_CRIT` (red), so a filling context catches your eye. Hidden early in a session and right after `/compact` (until the next API call repopulates the value). On by default; set `STATUSLINE_CONTEXT=0` to hide it.

### Session cost

Opt-in (`STATUSLINE_COST=1`). Shown on the right as `$N.NN` from `cost.total_cost_usd` — Claude Code's client-side estimate of the current session's API cost.

### Usage indicator

The usage segment has two mutually exclusive sources (file takes priority); both keep rendering off the network:

- **Local file** — set `STATUSLINE_USAGE_FILE` and the script **self-populates** the file from the `rate_limits` Claude Code already passes on stdin (Pro/Max sessions, after the first API response), then reads it back on each render. Use `1`/`true`/`on` for the default `~/.claude/usage.json`, or give an explicit path. No token, no OAuth, no `401`, no network — and no second script (Claude Code runs only one status-line command). The value persists between renders, so it stays visible even on refreshes where Claude Code omits `rate_limits`.
- **Remote URL** — set `STATUSLINE_USAGE_URL` and the script fetches that JSON **in the background** (detached `curl`), caching it at `~/.cache/claude-statusline-usage.json`. Bring your own endpoint (a small cron job that exports your limits works well) — there is no default public source.

Either source must contain:

```json
{ "fiveHour": { "usedPercent": 17 } }
```

`usedPercent` is `0..100`.

## How it works

Claude Code runs the `command` on every status refresh, passing a JSON blob on **stdin** (model, effort, `workspace.current_dir`, …) and rendering the script's **stdout** (ANSI colors supported). This script reads that JSON, builds the left/right segments, and right-aligns using `COLUMNS`.

## Test it

```bash
npm run demo
# or:
echo '{"model":{"id":"claude-sonnet-4-6","display_name":"Sonnet 4.6"},"effort":{"level":"low"},"workspace":{"current_dir":"'"$PWD"'"}}' \
  | COLUMNS=120 node statusline.cjs; echo
```

## License

MIT © Stanislav Popov (popstas)
