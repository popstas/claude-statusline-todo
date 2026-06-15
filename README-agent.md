# Agent setup guide

You are an AI agent (e.g. Claude Code) installing **claude-statusline-todo** as the user's Claude Code status line. Follow these steps exactly. Do not invent extra behavior. Keep existing settings intact.

## Result

A status line that shows, on the **left**, `docs/TODO.md` checkbox progress; on the **right**, `model · effort` (and an optional usage %), pinned to the right edge.

## Steps

1. **Pick the install scope** (ask the user if unclear):
   - **User-wide** — applies to every project that has no status line of its own → target `~/.claude/settings.json`.
   - **This project only** → target `<project>/.claude/settings.json`. A project setting overrides the user one.

2. **Place the script** at a stable absolute path. Recommended `~/.claude/statusline-todo.cjs`:
   ```bash
   cp "<repo>/statusline.cjs" ~/.claude/statusline-todo.cjs
   ```
   (Or point directly at the repo's `statusline.cjs` — just use its absolute path below.)

3. **Edit the target `settings.json`** (create it as `{}` if missing). Parse the JSON, then add or replace **only** the top-level `statusLine` key, preserving everything else:
   ```json
   "statusLine": {
     "type": "command",
     "command": "node /ABSOLUTE/PATH/statusline-todo.cjs"
   }
   ```
   - The path **must be absolute** — at runtime the working directory is the project folder, not `~/.claude`.
   - Write back valid JSON. Never clobber unrelated keys.

4. **(Optional) Usage indicator.** Only if the user has a JSON endpoint reporting their limit. Add to the same file's `env` block:
   ```json
   "env": { "STATUSLINE_USAGE_URL": "https://example.com/claude-usage.json" }
   ```
   The endpoint must return `{"fiveHour":{"usedPercent": <0..100>}}`. If the user has no such endpoint, **skip this** — the segment stays hidden.

5. **(Optional) TODO source.** Default is `docs/TODO.md` relative to each project. To change it, set env `STATUSLINE_TODO` (relative or absolute). Make sure the file contains `- [ ]` / `- [x]` lines, otherwise the left segment is empty (by design).

6. **Verify** without restarting Claude Code — pipe a sample status JSON:
   ```bash
   echo '{"model":{"id":"claude-opus-4-8","display_name":"Opus 4.8"},"effort":{"level":"high"},"workspace":{"current_dir":"'"$PWD"'"}}' \
     | node ~/.claude/statusline-todo.cjs; echo
   ```
   Expect `Opus 4.8 · high` on the right, and `📋 done/total │ %` on the left if `docs/TODO.md` exists in `$PWD`.

7. **Tell the user**:
   - Precedence: project `.claude/settings.json` > user `~/.claude/settings.json`.
   - The line refreshes on its own; no restart required.
   - Usage % (if enabled) updates in the background every `STATUSLINE_USAGE_TTL` seconds.

## Config reference (env, all optional)

| Variable | Default | Meaning |
|---|---|---|
| `STATUSLINE_TODO` | `docs/TODO.md` | TODO file path (relative or absolute). |
| `STATUSLINE_USAGE_URL` | _(unset → off)_ | JSON usage endpoint. |
| `STATUSLINE_USAGE_WARN` | `70` | Yellow threshold (%). |
| `STATUSLINE_USAGE_CRIT` | `90` | Red threshold (%). |
| `STATUSLINE_USAGE_TTL` | `90` | Background refresh interval (s). |
| `STATUSLINE_RESERVE` | `3` | Columns kept free at the right edge. |

## Constraints

- **No npm dependencies.** It is one `.cjs` file; keep it that way.
- **Never block on the network** during render. Usage fetching is background-only.
- **Don't overwrite** unrelated `settings.json` keys.
- Requires Node ≥ 18 and `curl` (only if the usage indicator is enabled).
