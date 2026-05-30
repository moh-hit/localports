import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ── AppleScript helpers ────────────────────────────────────────────────────

function osascript(script: string): void {
  const child = spawn('osascript', ['-e', script.trim()], { stdio: 'ignore' });
  child.on('error', () => {});
}

/** Escape for use inside an AppleScript double-quoted string. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Shell-escape a path for use inside single quotes. */
function shellEscPath(s: string): string {
  return s.replace(/'/g, "'\\''");
}

// ── Terminal definitions ───────────────────────────────────────────────────

type ScriptFn = (cmd: string) => string;

/**
 * Factory for terminals that don't expose a tab-creation AppleScript API.
 * Uses System Events to send ⌘T then type the command.
 * Requires Accessibility permission (macOS prompts once).
 */
function systemEventsTab(app: string, processName = app): ScriptFn {
  return cmd => `
    tell application "${app}" to activate
    delay 0.25
    tell application "System Events"
      tell process "${processName}"
        keystroke "t" using {command down}
        delay 0.35
        keystroke "${cmd}"
        key code 36
      end tell
    end tell
  `;
}

/**
 * Keyed by the value of $TERM_PROGRAM set by each terminal.
 * Each entry is a function (escaped shellCmd) → AppleScript string.
 */
const TERMINALS: Record<string, ScriptFn> = {
  'iTerm.app': cmd => `
    tell application "iTerm2"
      activate
      tell current window
        create tab with default profile command "${cmd}"
      end tell
    end tell
  `,

  'Apple_Terminal': cmd => `
    tell application "Terminal"
      activate
      tell application "System Events"
        tell process "Terminal"
          keystroke "t" using {command down}
        end tell
      end tell
      delay 0.2
      do script "${cmd}" in selected tab of front window
    end tell
  `,

  'WarpTerminal': systemEventsTab('Warp'),
  'ghostty':      systemEventsTab('Ghostty'),
};

/** Fallback: open a new Terminal.app window (always available on macOS). */
const FALLBACK: ScriptFn = cmd => `
  tell application "Terminal"
    do script "${cmd}"
    activate
  end tell
`;

// ── Spawn-command resolution ───────────────────────────────────────────────

function detectPackageManager(rawCwd: string): string {
  if (existsSync(join(rawCwd, 'bun.lockb')))      return 'bun';
  if (existsSync(join(rawCwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(rawCwd, 'yarn.lock')))       return 'yarn';
  return 'npm';
}

/**
 * Resolve the best runnable command for a label + cwd.
 * Labels can be process titles like "next-server (v16.1.6)" — not directly
 * runnable. This maps them to the real command via node_modules/.bin or
 * package.json scripts.
 */
function resolveSpawnCmd(label: string, rawCwd: string): string {
  const cleaned = label.replace(/\s*\([^)]+\)\s*/g, '').trim();
  const bin = cleaned.split(/\s+/)[0] ?? '';

  if (bin && existsSync(join(rawCwd, 'node_modules', '.bin', bin))) {
    return cleaned;
  }

  try {
    const pkg = JSON.parse(readFileSync(join(rawCwd, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    const pm = detectPackageManager(rawCwd);
    const run = (name: string) => pm === 'npm' ? `npm run ${name}` : `${pm} ${name}`;

    for (const name of ['dev', 'start', 'serve', 'develop']) {
      if (scripts[name]) return run(name);
    }
    for (const [name, cmd] of Object.entries(scripts)) {
      if (cmd.split(/[\s/]+/).some(part => part === bin || part === `${bin}.js`)) {
        return run(name);
      }
    }
  } catch {}

  return cleaned;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function openInNewTab(label: string, rawCwd: string): void {
  const cmd = resolveSpawnCmd(label, rawCwd);
  const shellCmd = `cd '${shellEscPath(rawCwd)}' && ${cmd}`;
  const escaped = esc(shellCmd);

  const scriptFn = TERMINALS[process.env.TERM_PROGRAM ?? ''] ?? FALLBACK;
  osascript(scriptFn(escaped));
}
