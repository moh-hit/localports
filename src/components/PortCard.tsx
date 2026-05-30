import React from 'react';
import { Box, Text } from 'ink';
import type { PortEntry } from '../hooks/usePorts.js';
import { formatUptime } from '../hooks/usePorts.js';

interface Props {
  entry: PortEntry;
  selected: boolean;
  action: string | null;
}

export function PortCard({ entry, selected, action }: Props) {
  const borderColor = action ? 'yellow' : selected ? 'cyan' : 'gray';
  const portColor = selected ? 'cyanBright' : 'cyan';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      marginBottom={0}
    >
      <Box gap={2} alignItems="center">
        <Text color={portColor} bold>:{entry.port}</Text>
        <Text color={selected ? 'white' : 'gray'}>{entry.args ?? entry.command}</Text>
        <Box flexGrow={1} />
        {action
          ? <Text color="yellow">{action}…</Text>
          : <Text color={selected ? 'greenBright' : 'green'} dimColor={!selected}>●</Text>
        }
      </Box>

      <Box gap={3}>
        <Text color="gray" dimColor>pid <Text color={selected ? 'white' : 'gray'}>{entry.pid}</Text></Text>
        {entry.cwd && <Text color={selected ? 'blueBright' : 'gray'} dimColor={!selected}>{entry.cwd}</Text>}
        {entry.uptime !== null && (
          <Text color="gray" dimColor>up <Text color={selected ? 'white' : 'gray'}>{formatUptime(entry.uptime)}</Text></Text>
        )}
      </Box>
    </Box>
  );
}
