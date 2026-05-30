import { useInput } from 'ink';

interface KeymapOptions {
  onUp: () => void;
  onDown: () => void;
  onKill: () => void;
  onOpen: () => void;
  onRestart: () => void;
  onTunnel: () => void;
  onFilterChar: (char: string) => void;
  onFilterActivate: () => void;
  onFilterClear: () => void;
  onQuit: () => void;
  filterActive: boolean;
}

export function useKeymap(opts: KeymapOptions) {
  useInput((input, key) => {
    if (key.ctrl && input === 'c') { opts.onQuit(); return; }

    if (opts.filterActive) {
      if (key.escape) { opts.onFilterClear(); return; }
      if (key.backspace || key.delete) { opts.onFilterChar('\b'); return; }
      if (key.upArrow) { opts.onUp(); return; }
      if (key.downArrow) { opts.onDown(); return; }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        opts.onFilterChar(input);
      }
      return;
    }

    // Normal nav mode — single keys are unambiguous actions
    if (key.escape || input === 'q') { opts.onQuit(); return; }
    if (key.upArrow || input === 'k') { opts.onUp(); return; }
    if (key.downArrow || input === 'j') { opts.onDown(); return; }
    if (input === 'x') { opts.onKill(); return; }
    if (input === 'o') { opts.onOpen(); return; }
    if (input === 'r') { opts.onRestart(); return; }
    if (input === 't') { opts.onTunnel(); return; }
    if (input === '/') { opts.onFilterActivate(); return; }
  });
}
