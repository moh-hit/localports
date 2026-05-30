import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ── Helpers ────────────────────────────────────────────────────────────────

function shellEscPath(s: string): string {
  return s.replace(/'/g, "'\\''");
}

function spawnDetached(bin: string, args: string[]): void {
  const child = spawn(bin, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}

// ── Spawn-command resolution (shared) ─────────────────────────────────────

function detectPackageManager(rawCwd: string): string {
  if (existsSync(join(rawCwd, 'bun.lockb')))      return 'bun';
  if (existsSync(join(rawCwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(rawCwd, 'yarn.lock')))       return 'yarn';
  return 'npm';
}

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

// ── macOS ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function osascript(script: string): void {
  const child = spawn('osascript', ['-e', script.trim()], { stdio: 'ignore' });
  child.on('error', () => {});
}

type ScriptFn = (cmd: string) => string;

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

const MACOS_TERMINALS: Record<string, ScriptFn> = {
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

const MACOS_FALLBACK: ScriptFn = cmd => `
  tell application "Terminal"
    do script "${cmd}"
    activate
  end tell
`;

function openInNewTabMacOS(shellCmd: string): void {
  const scriptFn = MACOS_TERMINALS[process.env.TERM_PROGRAM ?? ''] ?? MACOS_FALLBACK;
  osascript(scriptFn(esc(shellCmd)));
}

// ── Linux ──────────────────────────────────────────────────────────────────

interface LinuxTerminal {
  detect: () => boolean;
  open: (shellCmd: string) => void;
}

const LINUX_TERMINALS: LinuxTerminal[] = [
  {
    detect: () => !!process.env.KITTY_WINDOW_ID,
    open: cmd => spawnDetached('kitty', ['@', 'launch', '--type=tab', 'sh', '-c', cmd]),
  },
  {
    detect: () => !!process.env.WEZTERM_PANE,
    open: cmd => spawnDetached('wezterm', ['cli', 'spawn', '--', 'sh', '-c', cmd]),
  },
  {
    detect: () => !!process.env.KONSOLE_VERSION,
    open: cmd => spawnDetached('konsole', ['--new-tab', '-e', 'sh', '-c', cmd]),
  },
  {
    detect: () => !!process.env.TILIX_ID,
    open: cmd => spawnDetached('tilix', ['--new-window', '-e', `sh -c '${cmd}'`]),
  },
  {
    detect: () => !!process.env.VTE_VERSION,
    open: cmd => spawnDetached('gnome-terminal', ['--tab', '--', 'sh', '-c', `${cmd}; exec bash`]),
  },
  {
    // x-terminal-emulator is the Debian/Ubuntu alternatives system default
    detect: () => true,
    open: cmd => spawnDetached('x-terminal-emulator', ['-e', `sh -c '${cmd}'`]),
  },
];

function openInNewTabLinux(shellCmd: string): void {
  const terminal = LINUX_TERMINALS.find(t => t.detect())!;
  terminal.open(shellCmd);
}

// ── Public API ─────────────────────────────────────────────────────────────

export function openInNewTab(label: string, rawCwd: string): void {
  const cmd = resolveSpawnCmd(label, rawCwd);
  const shellCmd = `cd '${shellEscPath(rawCwd)}' && ${cmd}`;

  if (process.platform === 'linux') {
    openInNewTabLinux(shellCmd);
  } else {
    openInNewTabMacOS(shellCmd);
  }
}
