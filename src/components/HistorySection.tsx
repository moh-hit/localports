import React from 'react';
import { Box, Text } from 'ink';
import type { HistoryEntry } from '../hooks/useHistory.js';

interface Props {
  entries: HistoryEntry[];
  selectedIndex: number;
  startingIds: Set<string>;
}

export function HistorySection({ entries, selectedIndex, startingIds }: Props) {
  if (entries.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>─── recent ───────────────────────────────</Text>
      {entries.map((entry, i) => {
        const sel = i === selectedIndex;
        const starting = startingIds.has(entry.id);
        return (
          <Box key={entry.id} gap={2} paddingX={1}>
            <Text color={sel ? 'cyanBright' : 'gray'} bold={sel}>
              :{entry.port}
            </Text>
            <Text color={sel ? 'white' : 'gray'}>
              {entry.label}
            </Text>
            <Text color={sel ? 'blueBright' : 'gray'} dimColor={!sel}>
              {entry.cwd}
            </Text>
            {starting && (
              <Text color="yellow">starting…</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
