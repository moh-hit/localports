import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useApp } from 'ink';
import { spawnSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import { openInNewTab } from './lib/terminal.js';
import { startTunnel, type TunnelState } from './lib/tunnel.js';
import { usePorts, type PortEntry } from './hooks/usePorts.js';
import { useHistory } from './hooks/useHistory.js';
import { useKeymap } from './hooks/useKeymap.js';
import { PortCard } from './components/PortCard.js';
import { HistorySection } from './components/HistorySection.js';
import { SystemRow } from './components/SystemRow.js';
import { StatusBar } from './components/StatusBar.js';

type Action = 'opening' | 'restarting';

export function App() {
  const { exit } = useApp();
  const ports = usePorts(2000);
  const history = useHistory();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [actions, setActions] = useState<Map<number, Action>>(new Map());
  const [killedPorts, setKilledPorts] = useState<Set<number>>(new Set());
  const killTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // History entries currently being started (show indicator until port appears live)
  const [startingIds, setStartingIds] = useState<Set<string>>(new Set());
  const startTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Tunnel state per port
  const [tunnels, setTunnels] = useState<Map<number, TunnelState>>(new Map());
  const tunnelProcs = useRef<Map<number, ChildProcess>>(new Map());

  // Track previous dev ports to detect natural disappearances
  const prevDevPorts = useRef<Map<number, PortEntry>>(new Map());

  const devPorts = ports.filter(p => p.isDev);
  const systemPorts = ports.filter(p => !p.isDev);

  // Record history when a dev port disappears on its own
  useEffect(() => {
    for (const [port, entry] of prevDevPorts.current) {
      const stillAlive = devPorts.some(p => p.port === port);
      if (!stillAlive && entry.cwd && entry.args && !killedPorts.has(port)) {
        history.record(port, entry.args, entry.cwd);
      }
    }
    prevDevPorts.current = new Map(devPorts.map(p => [p.port, p]));
  }, [ports]);

  // Clean up optimistically-hidden ports once scan confirms they're gone
  useEffect(() => {
    setKilledPorts(prev => {
      if (prev.size === 0) return prev;
      const active = new Set(ports.map(p => p.port));
      const next = new Set([...prev].filter(p => active.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [ports]);

  // Kill tunnel procs for ports that are no longer alive
  useEffect(() => {
    const activePortNums = new Set(devPorts.map(p => p.port));
    for (const [port, proc] of tunnelProcs.current) {
      if (!activePortNums.has(port)) {
        proc.kill();
        tunnelProcs.current.delete(port);
        setTunnels(prev => { const n = new Map(prev); n.delete(port); return n; });
      }
    }
  }, [ports]);

  // Remove "starting…" once the port shows up live
  useEffect(() => {
    if (startingIds.size === 0) return;
    const liveSet = new Set(devPorts.map(p => p.cwd && p.args ? `${p.cwd}|${p.args}` : ''));
    setStartingIds(prev => {
      const next = new Set([...prev].filter(id => !liveSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [ports]);

  const filteredPorts = (filter
    ? devPorts.filter(p =>
        String(p.port).includes(filter) ||
        p.command.toLowerCase().includes(filter.toLowerCase()) ||
        (p.args ?? '').toLowerCase().includes(filter.toLowerCase()) ||
        (p.cwd ?? '').toLowerCase().includes(filter.toLowerCase())
      )
    : devPorts
  ).filter(p => !killedPorts.has(p.port));

  // History entries not currently running, optionally filtered
  const liveIds = new Set(devPorts.map(p => p.cwd && p.args ? `${p.cwd}|${p.args}` : ''));
  const filteredHistory = history.entries
    .filter(h => !liveIds.has(h.id))
    .filter(h => !filter || (
      String(h.port).includes(filter) ||
      h.label.toLowerCase().includes(filter.toLowerCase()) ||
      h.cwd.toLowerCase().includes(filter.toLowerCase())
    ));

  const totalItems = filteredPorts.length + filteredHistory.length;

  // Clamp selection
  useEffect(() => {
    if (totalItems > 0 && selectedIndex >= totalItems) {
      setSelectedIndex(totalItems - 1);
    }
  }, [totalItems, selectedIndex]);

  // Resolve what's currently selected
  const selectedIsPort = selectedIndex < filteredPorts.length;
  const selectedPort = selectedIsPort ? filteredPorts[selectedIndex] : undefined;
  const selectedHistory = !selectedIsPort
    ? filteredHistory[selectedIndex - filteredPorts.length]
    : undefined;

  const selectionKind = selectedPort ? 'port' : selectedHistory ? 'history' : 'none';

  const setAction = (port: number, action: Action | null) => {
    setActions(prev => {
      const next = new Map(prev);
      if (action === null) next.delete(port);
      else next.set(port, action);
      return next;
    });
  };

  const handleKill = useCallback(() => {
    if (!selectedPort) return;
    const { port, pid, args, cwd } = selectedPort;

    // Record history before killing
    if (args && cwd) history.record(port, args, cwd);

    // Optimistic remove
    setKilledPorts(prev => new Set([...prev, port]));
    try { process.kill(pid, 'SIGTERM'); } catch {}

    const existing = killTimers.current.get(port);
    if (existing) clearTimeout(existing);
    killTimers.current.set(port, setTimeout(() => {
      setKilledPorts(prev => { const n = new Set(prev); n.delete(port); return n; });
      killTimers.current.delete(port);
    }, 4000));
  }, [selectedPort]);

  const handleOpen = useCallback(() => {
    if (!selectedPort) return;
    setAction(selectedPort.port, 'opening');
    try { spawnSync('open', [`http://localhost:${selectedPort.port}`]); } catch {}
    setTimeout(() => setAction(selectedPort.port, null), 800);
  }, [selectedPort]);

  const startHistory = useCallback((id: string, label: string, cwd: string) => {
    const rawCwd = cwd.replace(/^~/, process.env.HOME ?? '');
    openInNewTab(label, rawCwd);

    // Show "starting…" indicator
    setStartingIds(prev => new Set([...prev, id]));

    // Safety: clear after 15s in case process fails to bind a port
    const existing = startTimers.current.get(id);
    if (existing) clearTimeout(existing);
    startTimers.current.set(id, setTimeout(() => {
      setStartingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      startTimers.current.delete(id);
    }, 15000));
  }, []);

  const handleRestart = useCallback(() => {
    if (selectedPort) {
      const entry = selectedPort;
      setAction(entry.port, 'restarting');
      try { process.kill(entry.pid, 'SIGTERM'); } catch {}
      setTimeout(() => {
        if (entry.cwd && entry.args) {
          const rawCwd = entry.cwd.replace(/^~/, process.env.HOME ?? '');
          openInNewTab(entry.args, rawCwd);
        }
        setAction(entry.port, null);
      }, 800);
    } else if (selectedHistory) {
      startHistory(selectedHistory.id, selectedHistory.label, selectedHistory.cwd);
    }
  }, [selectedPort, selectedHistory, startHistory]);

  const handleTunnel = useCallback(() => {
    if (!selectedPort) return;
    const { port } = selectedPort;

    const existing = tunnelProcs.current.get(port);
    if (existing) {
      existing.kill();
      tunnelProcs.current.delete(port);
      setTunnels(prev => { const n = new Map(prev); n.delete(port); return n; });
      return;
    }

    setTunnels(prev => new Map(prev).set(port, { status: 'starting' }));
    const proc = startTunnel(port, state => {
      setTunnels(prev => new Map(prev).set(port, state));
    });
    if (proc) tunnelProcs.current.set(port, proc);
  }, [selectedPort]);

  const handleKillOrRemove = useCallback(() => {
    if (selectedPort) {
      handleKill();
    } else if (selectedHistory) {
      history.remove(selectedHistory.id);
    }
  }, [selectedPort, selectedHistory, handleKill]);

  const handleFilterChar = useCallback((char: string) => {
    if (char === '\b') {
      setFilter(f => {
        const next = f.slice(0, -1);
        if (next.length === 0) setFilterActive(false);
        return next;
      });
    } else {
      setFilter(f => f + char);
      setSelectedIndex(0);
    }
  }, []);

  const handleFilterClear = useCallback(() => {
    setFilter('');
    setFilterActive(false);
  }, []);

  useKeymap({
    onUp: () => setSelectedIndex(i => Math.max(0, i - 1)),
    onDown: () => setSelectedIndex(i => Math.min(totalItems - 1, i + 1)),
    onKill: handleKillOrRemove,
    onOpen: handleOpen,
    onRestart: handleRestart,
    onTunnel: handleTunnel,
    onFilterChar: handleFilterChar,
    onFilterActivate: () => setFilterActive(true),
    onFilterClear: handleFilterClear,
    onQuit: exit,
    filterActive,
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={2} marginBottom={1} marginTop={1}>
        <Text color="cyanBright" bold>◉ localports</Text>
        <Text color="gray" dimColor>localhost port manager</Text>
      </Box>

      {/* Live dev ports */}
      {filteredPorts.length === 0 && !filter ? (
        <Box paddingX={1}>
          <Text color="gray" dimColor>no listening dev ports found</Text>
        </Box>
      ) : filteredPorts.length === 0 && filter ? null : (
        <Box flexDirection="column" gap={0}>
          {filteredPorts.map((entry, i) => (
            <PortCard
              key={entry.port}
              entry={entry}
              selected={i === selectedIndex}
              action={actions.get(entry.port) ?? null}
              tunnel={tunnels.get(entry.port)}
            />
          ))}
        </Box>
      )}

      {/* History */}
      <HistorySection
        entries={filteredHistory}
        selectedIndex={selectedIsPort ? -1 : selectedIndex - filteredPorts.length}
        startingIds={startingIds}
      />

      {/* No results for active filter */}
      {filter && filteredPorts.length === 0 && filteredHistory.length === 0 && (
        <Box paddingX={1}>
          <Text color="gray" dimColor>
            no ports match "<Text color="yellow">{filter}</Text>"
          </Text>
        </Box>
      )}

      <SystemRow entries={systemPorts} />

      <StatusBar
        filter={filter}
        filterActive={filterActive}
        total={devPorts.length}
        filtered={filteredPorts.length}
        selectionKind={selectionKind}
      />
    </Box>
  );
}
