import { useState, useEffect, useRef } from 'react';
import { exec, execFile } from 'child_process';
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
  processName: string | null; // clean name from ps -c (no path, no args)
  args: string | null;        // resolved dev label (expo start, next dev, etc.)
  uptime: number | null;
}

// lsof encodes spaces and special chars as \xNN
function decodeLsof(s: string): string {
  return s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
}

const KNOWN_SYSTEM: Record<number, string> = {
  5432: 'postgres',
  6379: 'redis',
  27017: 'mongod',
  3306: 'mysql',
  8080: 'http-alt',
  9200: 'elasticsearch',
  2181: 'zookeeper',
};

const DEV_COMMANDS = new Set([
  'node', 'bun', 'deno', 'python', 'python3', 'ruby',
  'java', 'go', 'cargo', 'php', 'vite', 'next-server',
  'webpack', 'parcel', 'esbuild', 'tsx', 'ts-node',
]);

const MACOS_SYSTEM_APPS = new Set([
  'ControlCenter', 'Control Center', 'sharingd', 'rapportd', 'AirPlayXPCHel',
  'SystemUIServer', 'cfprefsd', 'distnoted', 'nsurlsessiond', 'bird',
  'cloudd', 'syncdefaultsd', 'mDNSResponder', 'bluetoothd', 'AirPlayXPCHelper',
  'com.apple.WebKit', 'Safari', 'Finder', 'Dock', 'loginwindow',
  'Raycast', 'raycast',
  'Figma', 'figma_agent',
  'Dropbox', 'DropboxMacUpd',
  'Adobe', 'AdobeIPCBroker', 'AdobeCRD', 'AdobeNotific',
  'Creative Cloud', 'CCXProcess', 'CCLibrary',
  'Logi Options', 'logioptionsd', 'LogiMgr',
  'Spotify', 'Slack', 'Discord', 'Zoom', 'zoom.us', 'Teams',
  'Notion', 'Linear', '1Password', 'onepassword',
  'Alfred', 'Bartender', 'CleanMyMac',
  'Docker', 'com.docker',
  'Proxyman', 'Charles', 'Wireshark',
  'TablePlus', 'Sequel Pro',
  'Tower', 'Fork', 'SourceTree',
  'Xcode', 'Simulator',
  'agent-ser',
]);

function classifyDev(port: number, command: string, cwd: string | null): boolean {
  if (KNOWN_SYSTEM[port]) return false;
  const cmd = command.trim();
  if (MACOS_SYSTEM_APPS.has(cmd)) return false;
  for (const app of MACOS_SYSTEM_APPS) {
    if (cmd.startsWith(app) || app.startsWith(cmd)) return false;
  }
  if (DEV_COMMANDS.has(cmd.toLowerCase())) return true;
  if (cwd && cwd.startsWith('~')) return true;
  return false;
}

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

  // node/bun running a script — find the real tool from node_modules
  if (bin === 'node' || bin === 'bun' || bin === 'npx') {
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]!;
      if (part.startsWith('-')) continue;
      const normalized = normalizePath(part);

      // node_modules/.bin/toolname
      const binMatch = normalized.match(/node_modules\/\.bin\/([^/]+)$/);
      if (binMatch) {
        const tool = binMatch[1]!;
        const sub = parts.slice(i + 1).filter((a: string) => !a.startsWith('-')).slice(0, 1).join(' ');
        return sub ? `${tool} ${sub}` : tool;
      }

      // node_modules/package/bin/... or node_modules/package/dist/bin/...
      const pkgMatch = normalized.match(/node_modules\/(@?[^/]+(?:\/[^/]+)?)\/(?:[^/]*bin[^/]*)\/[^/]+$/);
      if (pkgMatch) {
        const tool = pkgMatch[1]!.split('/').pop()!;
        const sub = parts.slice(i + 1).filter((a: string) => !a.startsWith('-')).slice(0, 1).join(' ');
        return sub ? `${tool} ${sub}` : tool;
      }
    }
  }

  // Default: binary name + up to 2 meaningful args (subcommands, not flags or paths)
  const sub = parts.slice(1)
    .filter((a: string) => !a.startsWith('-') && !a.startsWith('/') && !a.includes('node_modules'))
    .slice(0, 2)
    .join(' ');
  return sub ? `${bin} ${sub}` : bin;
}

async function fetchMeta(pid: number): Promise<ProcessMeta> {
  const [cwdResult, commResult, cmdResult, etimeResult] = await Promise.allSettled([
    execFileAsync('lsof', ['-p', String(pid), '-a', '-d', 'cwd', '-Fn']),
    execFileAsync('ps', ['-p', String(pid), '-c', '-o', 'command=']), // name only, no path
    execFileAsync('ps', ['-p', String(pid), '-o', 'command=']),       // full command line
    execFileAsync('ps', ['-p', String(pid), '-o', 'etime=']),
  ]);

  // cwd
  let cwd: string | null = null;
  if (cwdResult.status === 'fulfilled') {
    const line = cwdResult.value.stdout.split('\n').find((l: string) => l.startsWith('n'));
    if (line) {
      const raw = line.slice(1).replace(/^\/private/, '');
      const home = process.env.HOME ?? '/Users';
      cwd = raw.startsWith(home) ? raw.replace(home, '~') : raw;
    }
  }

  // processName: clean name with no path — used for system app display
  let processName: string | null = null;
  if (commResult.status === 'fulfilled') {
    processName = commResult.value.stdout.trim() || null;
  }

  // args: resolved dev label (expo start, next dev, etc.)
  let args: string | null = null;
  if (cmdResult.status === 'fulfilled') {
    const fullCmd = cmdResult.value.stdout.trim();
    if (fullCmd) args = resolveLabel(fullCmd);
  }

  // uptime
  let uptime: number | null = null;
  if (etimeResult.status === 'fulfilled') {
    uptime = parseEtime(etimeResult.value.stdout.trim());
  }

  return { cwd, processName, args, uptime };
}

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

async function scanPorts(cache: Map<number, ProcessMeta>): Promise<PortEntry[]> {
  let stdout: string;
  try {
    ({ stdout } = await execAsync('lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null'));
  } catch {
    return [];
  }

  // Parse lsof output into (port, pid, command) triples — deduplicated by port
  const seen = new Map<number, { pid: number; command: string }>();
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

  // Fetch metadata for new PIDs only, cache the rest
  const newPids = new Set<number>();
  for (const { pid } of seen.values()) {
    if (!cache.has(pid)) newPids.add(pid);
  }

  // Evict stale PIDs from cache
  const activePids = new Set(Array.from(seen.values()).map(v => v.pid));
  for (const pid of cache.keys()) {
    if (!activePids.has(pid)) cache.delete(pid);
  }

  // Fetch all new PIDs in parallel
  await Promise.all(
    Array.from(newPids).map(async pid => {
      const meta = await fetchMeta(pid);
      cache.set(pid, meta);
    })
  );

  // Build final list
  const entries: PortEntry[] = [];
  for (const [port, { pid, command }] of seen) {
    const meta = cache.get(pid) ?? { cwd: null, processName: null, args: null, uptime: null };
    entries.push({
      port,
      pid,
      command,
      name: KNOWN_SYSTEM[port] ?? meta.processName ?? command,
      cwd: meta.cwd,
      args: meta.args,
      uptime: meta.uptime,
      isDev: classifyDev(port, command, meta.cwd),
    });
  }

  return entries.sort((a, b) => a.port - b.port);
}

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
