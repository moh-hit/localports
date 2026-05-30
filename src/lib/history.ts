import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface HistoryEntry {
  id: string;       // dedup key: "cwd|label"
  port: number;     // last seen port
  label: string;    // "expo start", "next dev"
  cwd: string;      // "~/myapp"
  lastSeen: number; // ms timestamp
}

const DIR = join(process.env.HOME ?? '~', '.localports');
const FILE = join(DIR, 'history.json');
const MAX = 20;

export function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(entries, null, 2));
  } catch {}
}

export function addToHistory(
  entries: HistoryEntry[],
  port: number,
  label: string,
  cwd: string,
): HistoryEntry[] {
  const id = `${cwd}|${label}`;
  const updated: HistoryEntry = { id, port, label, cwd, lastSeen: Date.now() };
  return [updated, ...entries.filter(e => e.id !== id)].slice(0, MAX);
}

export function removeFromHistory(entries: HistoryEntry[], id: string): HistoryEntry[] {
  return entries.filter(e => e.id !== id);
}
