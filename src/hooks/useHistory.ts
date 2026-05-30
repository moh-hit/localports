import { useState, useCallback } from 'react';
import {
  loadHistory, saveHistory, addToHistory, removeFromHistory,
  type HistoryEntry,
} from '../lib/history.js';

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory());

  const record = useCallback((port: number, label: string, cwd: string) => {
    setEntries(prev => {
      const next = addToHistory(prev, port, label, cwd);
      saveHistory(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setEntries(prev => {
      const next = removeFromHistory(prev, id);
      saveHistory(next);
      return next;
    });
  }, []);

  return { entries, record, remove };
}

export type { HistoryEntry };
