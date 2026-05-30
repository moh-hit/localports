import { useState, useEffect, useRef } from 'react';
import { exec, execFile } from 'child_process';
import { promises as fsp } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface PortEntry {
  port: number;
  pid: number;
  command: string;
  name: string;
  cwd: string | null;
  args: string | null;
  uptime: number | null;
  isDev: boolean;
}

interface ProcessMeta {
  cwd: string | null;
  processName: string | null;
  args: string | null;
  uptime: number | null;
}

// ── Shared constants ───────────────────────────────────────────────────────

const KNOWN_SYSTEM: Record<number, string> = {
  22:    'sshd',
  5432:  'postgres',
  6379:  'redis',
  27017: 'mongod',
  3306:  'mysql',
  8080:  'http-alt',
  9200:  'elasticsearch',
  2181:  'zookeeper',
};

const DEV_COMMANDS = new Set([
  'node', 'bun', 'deno', 'python', 'python3', 'ruby',
  'java', 'go', 'cargo', 'php', 'vite', 'next-server',
  'webpack', 'parcel', 'esbuild', 'tsx', 'ts-node',
]);

// macOS GUI apps that listen on ports but aren't dev servers
const MACOS_SYSTEM_APPS = new Set([
  'ControlCenter', 'Control Center', 'sharingd', 'rapportd', 'AirPlayXPCHel',
  'SystemUIServer', 'cfprefsd', 'distnoted', 'nsurlsessiond', 'bird',
  'cloudd', 'syncdefaultsd', 'mDNSResponder', 'bluetoothd', 'AirPlayXPCHelper',
  'com.apple.WebKit', 'Safari', 'Finder', 'Dock', 'loginwindow',
  'Raycast', 'raycast', 'Figma', 'figma_agent',
  'Dropbox', 'DropboxMacUpd',
  'Adobe', 'AdobeIPCBroker', 'AdobeCRD', 'AdobeNotific',
  'Creative Cloud', 'CCXProcess', 'CCLibrary',
  'Logi Options', 'logioptionsd', 'LogiMgr',
  'Spotify', 'Slack', 'Discord', 'Zoom', 'zoom.us', 'Teams',
  'Notion', 'Linear', '1Password', 'onepassword',
  'Alfred', 'Bartender', 'CleanMyMac',
  'Docker', 'com.docker',
  'Proxyman', 'Charles', 'Wireshark',
  'TablePlus', 'Sequel Pro', 'Tower', 'Fork', 'SourceTree',
  'Xcode', 'Simulator', 'agent-ser',
]);

function classifyDev(port: number, command: string, cwd: string | null): boolean {
  if (KNOWN_SYSTEM[port]) return false;
  const cmd = command.trim();

  if (process.platform === 'darwin') {
    if (MACOS_SYSTEM_APPS.has(cmd)) return false;
    for (const app of MACOS_SYSTEM_APPS) {
      if (cmd.startsWith(app) || app.startsWith(cmd)) return false;
    }
  }

  if (DEV_COMMANDS.has(cmd.toLowerCase())) return true;
  if (cwd && (cwd.startsWith('~') || cwd.startsWith('/home/'))) return true;
  return false;
}

// ── Label resolution (shared) ──────────────────────────────────────────────

function normalizePath(p: string): string {
  const parts = p.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.') out.push(part);
  }
  return out.join('/');
}

function resolveLabel(fullCmd: string): string {
  const parts = fullCmd.trim().split(/\s+/);
  const rawBin = parts[0]!;
  const bin = rawBin.split('/').pop()!;

  if (bin === 'node' || bin === 'bun' || bin === 'npx') {
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]!;
      if (part.startsWith('-')) continue;
      const normalized = normalizePath(part);

      const binMatch = normalized.match(/node_modules\/\.bin\/([^/]+)$/);
      if (binMatch) {
        const tool = binMatch[1]!;
        const sub = parts.slice(i + 1).filter((a: string) => !a.startsWith('-')).slice(0, 1).join(' ');
        return sub ? `${tool} ${sub}` : tool;
      }

      const pkgMatch = normalized.match(/node_modules\/(@?[^/]+(?:\/[^/]+)?)\/(?:[^/]*bin[^/]*)\/[^/]+$/);
      if (pkgMatch) {
        const tool = pkgMatch[1]!.split('/').pop()!;
        const sub = parts.slice(i + 1).filter((a: string) => !a.startsWith('-')).slice(0, 1).join(' ');
        return sub ? `${tool} ${sub}` : tool;
      }
    }
  }

  const sub = parts.slice(1)
    .filter((a: string) => !a.startsWith('-') && !a.startsWith('/') && !a.includes('node_modules'))
    .slice(0, 2)
    .join(' ');
  return sub ? `${bin} ${sub}` : bin;
}

// ── macOS metadata (lsof + ps) ─────────────────────────────────────────────

function parseEtime(etime: string): number {
  const parts = etime.trim().split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]!, 10) * 60 + parseInt(parts[1]!, 10);
  } else if (parts.length === 3) {
    const [hhOrDd, mm, ss] = parts;
    if (hhOrDd!.includes('-')) {
      const [dd, hh] = hhOrDd!.split('-');
      return parseInt(dd!, 10) * 86400 + parseInt(hh!, 10) * 3600 +
        parseInt(mm!, 10) * 60 + parseInt(ss!, 10);
    }
    return parseInt(hhOrDd!, 10) * 3600 + parseInt(mm!, 10) * 60 + parseInt(ss!, 10);
  }
  return 0;
}

async function fetchMetaMacOS(pid: number): Promise<ProcessMeta> {
  const [cwdResult, commResult, cmdResult, etimeResult] = await Promise.allSettled([
    execFileAsync('lsof', ['-p', String(pid), '-a', '-d', 'cwd', '-Fn']),
    execFileAsync('ps', ['-p', String(pid), '-c', '-o', 'command=']),
    execFileAsync('ps', ['-p', String(pid), '-o', 'command=']),
    execFileAsync('ps', ['-p', String(pid), '-o', 'etime=']),
  ]);

  let cwd: string | null = null;
  if (cwdResult.status === 'fulfilled') {
    const line = cwdResult.value.stdout.split('\n').find((l: string) => l.startsWith('n'));
    if (line) {
      const raw = line.slice(1).replace(/^\/private/, '');
      const home = process.env.HOME ?? '/Users';
      cwd = raw.startsWith(home) ? raw.replace(home, '~') : raw;
    }
  }

  let processName: string | null = null;
  if (commResult.status === 'fulfilled') {
    processName = commResult.value.stdout.trim() || null;
  }

  let args: string | null = null;
  if (cmdResult.status === 'fulfilled') {
    const fullCmd = cmdResult.value.stdout.trim();
    if (fullCmd) args = resolveLabel(fullCmd);
  }

  let uptime: number | null = null;
  if (etimeResult.status === 'fulfilled') {
    uptime = parseEtime(etimeResult.value.stdout.trim());
  }

  return { cwd, processName, args, uptime };
}

// ── Linux metadata (/proc — no subprocess needed) ─────────────────────────

async function fetchMetaLinux(pid: number): Promise<ProcessMeta> {
  const [cwdResult, cmdlineResult, statResult, uptimeResult] = await Promise.allSettled([
    fsp.realpath(`/proc/${pid}/cwd`),
    fsp.readFile(`/proc/${pid}/cmdline`),
    fsp.readFile(`/proc/${pid}/stat`, 'utf8'),
    fsp.readFile('/proc/uptime', 'utf8'),
  ]);

  let cwd: string | null = null;
  if (cwdResult.status === 'fulfilled') {
    const home = process.env.HOME ?? '/home';
    cwd = cwdResult.value.startsWith(home)
      ? cwdResult.value.replace(home, '~')
      : cwdResult.value;
  }

  let processName: string | null = null;
  let args: string | null = null;
  if (cmdlineResult.status === 'fulfilled') {
    const parts = cmdlineResult.value.toString().split('\0').filter(Boolean);
    processName = parts[0]?.split('/').pop() ?? null;
    if (parts.length) args = resolveLabel(parts.join(' '));
  }

  let uptime: number | null = null;
  if (statResult.status === 'fulfilled' && uptimeResult.status === 'fulfilled') {
    const fields = statResult.value.split(' ');
    const startJiffies = parseInt(fields[21]!, 10);
    const sysUptime = parseFloat(uptimeResult.value.split(' ')[0]!);
    uptime = Math.max(0, Math.floor(sysUptime - startJiffies / 100));
  }

  return { cwd, processName, args, uptime };
}

function fetchMeta(pid: number): Promise<ProcessMeta> {
  return process.platform === 'linux'
    ? fetchMetaLinux(pid)
    : fetchMetaMacOS(pid);
}

// ── Port scanners ──────────────────────────────────────────────────────────

// lsof encodes spaces as \xNN
function decodeLsof(s: string): string {
  return s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
}

async function parsePortsMacOS(): Promise<Map<number, { pid: number; command: string }>> {
  const seen = new Map<number, { pid: number; command: string }>();
  try {
    const { stdout } = await execAsync('lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null');
    for (const line of stdout.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 9) continue;
      const command = decodeLsof(parts[0]!);
      const pid = parseInt(parts[1]!, 10);
      const addrCol = parts[8]!;
      if (isNaN(pid)) continue;
      const portMatch = addrCol.match(/:(\d+)$/);
      if (!portMatch) continue;
      const port = parseInt(portMatch[1]!, 10);
      if (!seen.has(port)) seen.set(port, { pid, command });
    }
  } catch {}
  return seen;
}

async function parsePortsLinux(): Promise<Map<number, { pid: number; command: string }>> {
  const seen = new Map<number, { pid: number; command: string }>();
  try {
    const { stdout } = await execAsync('ss -tlnp 2>/dev/null');
    for (const line of stdout.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 5 || cols[1] !== 'LISTEN') continue;

      // Local address column: "0.0.0.0:3000" or "[::]:8081"
      const portStr = cols[4]!.split(':').pop();
      if (!portStr) continue;
      const port = parseInt(portStr, 10);
      if (isNaN(port) || port === 0) continue;

      // Process column: users:(("node",pid=1234,fd=5))
      const processCol = cols.slice(5).join(' ');
      const pidMatch = processCol.match(/pid=(\d+)/);
      const nameMatch = processCol.match(/\("([^"]+)"/);
      if (!pidMatch) continue; // belongs to another user

      const pid = parseInt(pidMatch[1]!, 10);
      const command = nameMatch?.[1] ?? 'unknown';
      if (!seen.has(port)) seen.set(port, { pid, command });
    }
  } catch {}
  return seen;
}

async function scanPorts(cache: Map<number, ProcessMeta>): Promise<PortEntry[]> {
  const seen = process.platform === 'linux'
    ? await parsePortsLinux()
    : await parsePortsMacOS();

  // Fetch metadata for new PIDs only
  const newPids = new Set<number>();
  for (const { pid } of seen.values()) {
    if (!cache.has(pid)) newPids.add(pid);
  }

  // Evict stale PIDs
  const activePids = new Set(Array.from(seen.values()).map(v => v.pid));
  for (const pid of cache.keys()) {
    if (!activePids.has(pid)) cache.delete(pid);
  }

  await Promise.all(
    Array.from(newPids).map(async pid => {
      cache.set(pid, await fetchMeta(pid));
    })
  );

  const entries: PortEntry[] = [];
  for (const [port, { pid, command }] of seen) {
    const meta = cache.get(pid) ?? { cwd: null, processName: null, args: null, uptime: null };
    entries.push({
      port, pid, command,
      name: KNOWN_SYSTEM[port] ?? meta.processName ?? command,
      cwd: meta.cwd,
      args: meta.args,
      uptime: meta.uptime,
      isDev: classifyDev(port, command, meta.cwd),
    });
  }

  return entries.sort((a, b) => a.port - b.port);
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function usePorts(intervalMs = 2000) {
  const [ports, setPorts] = useState<PortEntry[]>([]);
  const cache = useRef<Map<number, ProcessMeta>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      const result = await scanPorts(cache.current);
      if (!cancelled) setPorts(result);
      if (!cancelled) setTimeout(poll, intervalMs);
    }

    poll();
    return () => { cancelled = true; };
  }, [intervalMs]);

  return ports;
}
