# claude-statusline-todo

A tiny, zero-dependency [Claude Code](https://docs.claude.com/en/docs/claude-code) status line.

- **Left** — checkbox progress from your project's `docs/TODO.md` (`done/total` + percent).
- **Right** — the current **model · effort**, color-coded, pinned to the right edge.
- **Optional** — a **usage %** indicator (e.g. the 5-hour rate-limit window) from a JSON URL you provide.

```
📋 4/31 │ 13%                                     17% │ Opus 4.8 · high
└── docs/TODO.md ──┘                              └ usage ┘ └─ model · effort ─┘
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
| `STATUSLINE_USAGE_URL` | _(unset → off)_ | URL of a JSON usage report. When unset, the usage segment is hidden. |
| `STATUSLINE_USAGE_WARN` | `70` | Usage % at which the number turns yellow. |
| `STATUSLINE_USAGE_CRIT` | `90` | Usage % at which it turns red. |
| `STATUSLINE_USAGE_TTL` | `90` | Seconds before the cached usage value is refreshed (in the background). |
| `STATUSLINE_RESERVE` | `3` | Columns kept free at the right edge (Claude Code trims slightly early). |

### Usage indicator

When `STATUSLINE_USAGE_URL` is set, the script fetches that JSON **in the background** (detached `curl`) and caches it at `~/.cache/claude-statusline-usage.json`, so rendering never blocks on the network. The JSON must contain:

```json
{ "fiveHour": { "usedPercent": 17 } }
```

`usedPercent` is `0..100`. Bring your own endpoint (a small cron job that exports your limits works well) — there is no default public source.

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
