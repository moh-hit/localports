import { spawn, execFileSync } from 'child_process';
import type { ChildProcess } from 'child_process';

export type TunnelStatus = 'starting' | 'active' | 'error';

export interface TunnelState {
  status: TunnelStatus;
  url?: string;
  message?: string;
}

function installed(bin: string): boolean {
  try {
    execFileSync('which', [bin], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function detectTool(): 'cloudflared' | 'ngrok' | null {
  if (installed('cloudflared')) return 'cloudflared';
  if (installed('ngrok')) return 'ngrok';
  return null;
}

export function startTunnel(
  port: number,
  onUpdate: (state: TunnelState) => void,
): ChildProcess | null {
  const tool = detectTool();

  if (!tool) {
    onUpdate({ status: 'error', message: 'install cloudflared or ngrok to tunnel' });
    return null;
  }

  if (tool === 'cloudflared') {
    const proc = spawn(
      'cloudflared',
      ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const urlRe = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

    function scan(chunk: Buffer) {
      const match = chunk.toString().match(urlRe);
      if (match) onUpdate({ status: 'active', url: match[0] });
    }

    proc.stdout?.on('data', scan);
    proc.stderr?.on('data', scan);
    proc.on('error', err => onUpdate({ status: 'error', message: err.message }));
    return proc;
  }

  // ngrok — emits JSON log lines on stdout
  const proc = spawn(
    'ngrok',
    ['http', String(port), '--log', 'stdout', '--log-format', 'json'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  proc.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      try {
        const obj = JSON.parse(line);
        if (obj.url && (obj.msg === 'started tunnel' || obj.lvl === 'info')) {
          onUpdate({ status: 'active', url: obj.url });
        }
      } catch {}
    }
  });
  proc.on('error', err => onUpdate({ status: 'error', message: err.message }));
  return proc;
}
