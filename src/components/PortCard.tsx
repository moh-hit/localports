import React from 'react';
import { Box, Text } from 'ink';
import type { PortEntry } from '../hooks/usePorts.js';
import { formatUptime } from '../hooks/usePorts.js';
import type { TunnelState } from '../lib/tunnel.js';

interface Props {
  entry: PortEntry;
  selected: boolean;
  action: string | null;
  tunnel?: TunnelState;
}

export function PortCard({ entry, selected, action, tunnel }: Props) {
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

      {tunnel && (
        <Box gap={1}>
          {tunnel.status === 'starting' && (
            <Text color="yellow">⇡ tunneling…</Text>
          )}
          {tunnel.status === 'active' && tunnel.url && (
            <Text color="magentaBright">⇡ {tunnel.url}</Text>
          )}
          {tunnel.status === 'error' && tunnel.message && (
            <Text color="red">⇡ {tunnel.message}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
