# CLAUDE.md

Project guidance for working in this repo.

## What this is

`claude-statusline-todo` — a single-file Claude Code status line (`statusline.cjs`). It reads Claude Code's status JSON on stdin and prints one line: TODO progress (left) + `model · effort` and optional usage % (right).

## Hard rules

- **Zero dependencies.** Everything lives in `statusline.cjs`, pure Node (≥18), CommonJS (`.cjs`). Do not add npm packages or a build step.
- **Never block on the network during render.** The status line runs on every refresh. The usage indicator must stay background-only (detached `curl`, local cache).
- **Fail soft.** Missing files, bad JSON, no terminal width — degrade gracefully, never throw. Wrap risky reads in `try/catch`.
- **Config is env-only**, prefixed `STATUSLINE_`. Keep defaults sensible so the script works with no config. Document any new var in both `README.md` and `README-agent.md`.

## Conventions

- English for all code, comments, and docs (public repo).
- Keep colors quiet: the common case (`Opus · high`) is uncolored; only deviations get color.
- When changing rendering, test by piping a sample JSON (see below) — don't rely on a live Claude Code session.

## Test

```bash
npm run demo
echo '{"model":{"id":"claude-sonnet-4-6","display_name":"Sonnet 4.6"},"effort":{"level":"max"},"workspace":{"current_dir":"'"$PWD"'"}}' \
  | COLUMNS=120 node statusline.cjs; echo
```

## Dogfooding

This repo has its own `docs/TODO.md`; the status line shows it while you work here. Keep it current as tasks change.
