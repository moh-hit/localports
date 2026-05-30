import React from 'react';
import { Box, Text } from 'ink';
import type { PortEntry } from '../hooks/usePorts.js';

interface Props {
  entries: PortEntry[];
}

// Strip parenthetical suffixes like (Renderer), (GPU), (v16.1.6)
function baseLabel(entry: PortEntry): string {
  const label = entry.name ?? entry.command;
  return label.replace(/\s*\([^)]*\)\s*/g, '').trim();
}

export function SystemRow({ entries }: Props) {
  if (entries.length === 0) return null;

  // Group by base label
  const groups = new Map<string, { label: string; ports: number[] }>();
  for (const e of entries) {
    const key = baseLabel(e);
    if (!groups.has(key)) groups.set(key, { label: key, ports: [] });
    groups.get(key)!.ports.push(e.port);
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>─── system ───────────────────────────────</Text>
      <Box flexWrap="wrap" gap={2} paddingX={1} marginTop={0}>
        {Array.from(groups.values()).map(({ label, ports }) => (
          <Box key={label} gap={1}>
            <Text color="gray" dimColor>:{ports[0]}</Text>
            <Text color="gray">{label}</Text>
            {ports.length > 1 && (
              <Text color="gray" dimColor>×{ports.length}</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
