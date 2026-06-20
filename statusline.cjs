#!/usr/bin/env node
// claude-statusline-todo — a Claude Code status line.
//   left:  TODO.md checkbox progress  (done/total + %)
//   right: [usage %] · model · effort — pinned to the right edge
// Zero dependencies. Reads Claude Code's status JSON on stdin.
// Config via env (all optional): see README / README-agent.md.
const { readFileSync, writeFileSync, renameSync, statSync } = require("fs");
const { join, isAbsolute } = require("path");
const os = require("os");
const { spawn } = require("child_process");

// --- ANSI ---
const R = "\x1b[0m", DIM = "\x1b[2m";
const GREEN = "\x1b[32m", YELLOW = "\x1b[33m", BLUE = "\x1b[34m", RED = "\x1b[31m";
const WHITE_ON_RED = "\x1b[1;37;41m";

// --- config (env, all optional) ---
const TODO_REL = process.env.STATUSLINE_TODO || "docs/TODO.md";
const USAGE_URL = process.env.STATUSLINE_USAGE_URL || ""; // empty → usage segment off
// Alternative source: read a local JSON file (no network) instead of curling a URL.
// `1`/`true`/`on` → default ~/.claude/usage.json; any other value → that path (with ~).
const USAGE_FILE = (() => {
  const v = (process.env.STATUSLINE_USAGE_FILE || "").trim();
  if (!v) return "";
  if (/^(1|true|on)$/i.test(v)) return join(os.homedir(), ".claude", "usage.json");
  return v.startsWith("~") ? join(os.homedir(), v.slice(1)) : v;
})();
const USAGE_WARN = Number(process.env.STATUSLINE_USAGE_WARN || 70);
const USAGE_CRIT = Number(process.env.STATUSLINE_USAGE_CRIT || 90);
const USAGE_TTL_MS = Number(process.env.STATUSLINE_USAGE_TTL || 90) * 1000;
const RESERVE = Number(process.env.STATUSLINE_RESERVE || 3);
const USAGE_CACHE = join(os.homedir(), ".cache", "claude-statusline-usage.json");
// Branch segment: on by default; set STATUSLINE_BRANCH=0/off/false to disable.
const BRANCH_ON = !/^(0|off|false)$/i.test(process.env.STATUSLINE_BRANCH || "");
const BRANCH_HIDE = new Set(["main", "master"]); // never shown for these

// --- stdin: Claude Code status JSON ---
let input;
try { input = JSON.parse(readFileSync(0, "utf-8")); } catch {}
input = input || {};
const cwd = (input.workspace && input.workspace.current_dir) || input.cwd || process.cwd();

// --- left: TODO.md checkboxes (grep-like, no parser) ---
function tasksSegment() {
  const p = isAbsolute(TODO_REL) ? TODO_REL : join(cwd, TODO_REL);
  let text;
  try { text = readFileSync(p, "utf-8"); } catch { return ""; }
  const done = (text.match(/^[ \t]*[-*]\s+\[[xX]\]/gm) || []).length;
  const todo = (text.match(/^[ \t]*[-*]\s+\[ \]/gm) || []).length;
  const total = done + todo;
  if (total === 0) return "";
  const pct = Math.round((done / total) * 100);
  return "📋 " + GREEN + done + "/" + total + R + " " + DIM + "│ " + pct + "%" + R;
}

// --- left: current git branch (hidden on main/master). Reads .git directly,
//     walking up from cwd; never spawns, never blocks. ---
function gitDir(start) {
  let dir = start;
  for (let i = 0; i < 64; i++) {
    const g = join(dir, ".git");
    let st;
    try { st = statSync(g); } catch { st = null; }
    if (st) {
      if (st.isDirectory()) return g;
      // .git is a file (worktree/submodule): "gitdir: <path>"
      try {
        const m = readFileSync(g, "utf-8").match(/gitdir:\s*(.+)/);
        if (m) { const p = m[1].trim(); return isAbsolute(p) ? p : join(dir, p); }
      } catch {}
      return null;
    }
    const parent = join(dir, "..");
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

function branchSegment() {
  if (!BRANCH_ON) return "";
  try {
    const gd = gitDir(cwd);
    if (!gd) return "";
    const head = readFileSync(join(gd, "HEAD"), "utf-8").trim();
    let name;
    const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (ref) name = ref[1];
    else if (/^[0-9a-f]{7,40}$/i.test(head)) name = head.slice(0, 7); // detached HEAD
    if (!name || BRANCH_HIDE.has(name)) return "";
    return DIM + "⎇" + R + " " + name;
  } catch { return ""; }
}

// When STATUSLINE_USAGE_FILE is on, capture Claude Code's own rate limits (passed on
// stdin for Pro/Max sessions, after the first API response) into that file, so the
// file source is self-sustaining — no separate helper, no network, no OAuth. Atomic
// write, fail-soft: a missing/partial `rate_limits` just skips the update.
function captureUsage() {
  if (!USAGE_FILE) return;
  const rl = input.rate_limits;
  if (!rl) return;
  const win = (w) => (w && typeof w.used_percentage === "number"
    ? { usedPercent: w.used_percentage, resetsAt: w.resets_at ?? null } : null);
  const five = win(rl.five_hour), week = win(rl.seven_day);
  if (!five && !week) return;
  const out = {
    source: "claude-statusline-todo",
    updatedAt: Math.floor(Date.now() / 1000),
    fiveHour: five,
    weekly: week,
  };
  try {
    const tmp = USAGE_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(out));
    renameSync(tmp, USAGE_FILE);
  } catch {}
}

// Pull the 5-hour used percent out of a usage report (shape: {fiveHour:{usedPercent}}).
function readUsagePct(file) {
  try {
    const j = JSON.parse(readFileSync(file, "utf-8"));
    if (j && j.fiveHour && typeof j.fiveHour.usedPercent === "number") return j.fiveHour.usedPercent;
  } catch {}
  return null;
}

// --- right: usage % (optional). Two sources, mutually exclusive:
//   STATUSLINE_USAGE_FILE → read a local JSON file directly (no network).
//   STATUSLINE_USAGE_URL  → curl in the background, cached locally.
// Either way rendering never blocks on the network. ---
function usageSegment() {
  let pct = null;
  if (USAGE_FILE) {
    pct = readUsagePct(USAGE_FILE);
  } else if (USAGE_URL) {
    pct = readUsagePct(USAGE_CACHE);
    let mtime = 0;
    try { mtime = statSync(USAGE_CACHE).mtimeMs; } catch {}
    if (Date.now() - mtime > USAGE_TTL_MS) {
      try {
        const dir = join(os.homedir(), ".cache");
        spawn("sh", ["-c",
          `mkdir -p '${dir}' && curl -fsS --max-time 5 '${USAGE_URL}' -o '${USAGE_CACHE}.tmp' && mv '${USAGE_CACHE}.tmp' '${USAGE_CACHE}'`],
          { detached: true, stdio: "ignore" }).unref();
      } catch {}
    }
  } else {
    return "";
  }
  if (pct === null) return "";
  let c = ""; // < warn → normal color
  if (pct >= USAGE_CRIT) c = RED; else if (pct >= USAGE_WARN) c = YELLOW;
  const n = Math.round(pct * 10) / 10; // round to 0.1, drop float noise (28.999… → 29)
  return c ? c + n + "%" + R : n + "%";
}

// --- right: model · effort ---
function modelSegment() {
  if (!input.model) return "";
  const display = input.model.display_name || "";
  const id = input.model.id || "";

  // "Opus" + version from id (claude-opus-4-8 → 4.8). Skip if display already has a digit.
  let name = display;
  const ver = id.match(/claude-[a-z]+-(\d+)(?:-(\d+))?/i);
  if (display && !/\d/.test(display) && ver) {
    name = display + " " + ver[1] + (ver[2] ? "." + ver[2] : "");
  }
  if (!name) return "";

  // Model color by family (opus → normal).
  const fam = (id + " " + display).toLowerCase();
  let modelColor = "";
  if (fam.includes("haiku")) modelColor = BLUE;
  else if (fam.includes("sonnet")) modelColor = GREEN;
  else if (fam.includes("fable")) modelColor = RED;

  let seg = modelColor ? modelColor + name + R : name;

  // Effort color by level (high → normal).
  const level = input.effort && input.effort.level;
  if (level) {
    const eff = { low: BLUE, medium: GREEN, high: "", xhigh: RED, max: WHITE_ON_RED };
    const c = eff[level];
    seg += " " + DIM + "·" + R + " " + (c ? c + level + R : level);
  }
  return seg;
}

// Visible length: strip ANSI; count 📋 as 2 cells.
const visLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").replace(/📋/g, "xx").length;

captureUsage(); // refresh ~/.claude/usage.json from stdin's rate_limits (if file source on)

const left = [tasksSegment(), branchSegment()].filter(Boolean).join("  ");
const cluster = " " + DIM + "│" + R + " ";
const right = [usageSegment(), modelSegment()].filter(Boolean).join(cluster);

if (!right) {
  process.stdout.write(left);
  process.exit(0);
}

// Pin the right cluster to the right edge when terminal width is known.
// Claude Code passes COLUMNS but trims slightly before the real edge → keep RESERVE.
const cols = process.stdout.columns || Number(process.env.COLUMNS) || 0;
const sep = left ? cluster : "";
const gap = cols - visLen(left) - visLen(right) - RESERVE;
if (cols && gap > (left ? visLen(sep) : 0)) {
  process.stdout.write(left + " ".repeat(gap) + right);
} else {
  process.stdout.write(left + sep + right);
}
