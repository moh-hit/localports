import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  filter: string;
  filterActive: boolean;
  total: number;
  filtered: number;
  selectionKind: 'port' | 'history' | 'none';
}

function Key({ k }: { k: string }) {
  return <Text color="cyan" bold>{k}</Text>;
}

export function StatusBar({ filter, filterActive, total, filtered, selectionKind }: Props) {
  const hints = selectionKind === 'history' ? (
    <Text color="gray" dimColor>
      <Key k="↑↓" /><Text color="gray"> nav  </Text>
      <Key k="r" /><Text color="gray"> start  </Text>
      <Key k="x" /><Text color="gray"> remove  </Text>
      <Key k="/" /><Text color="gray"> filter  </Text>
      <Key k="q" /><Text color="gray"> quit</Text>
    </Text>
  ) : (
    <Text color="gray" dimColor>
      <Key k="↑↓" /><Text color="gray"> nav  </Text>
      <Key k="x" /><Text color="gray"> kill  </Text>
      <Key k="o" /><Text color="gray"> open  </Text>
      <Key k="r" /><Text color="gray"> restart  </Text>
      <Key k="/" /><Text color="gray"> filter  </Text>
      <Key k="q" /><Text color="gray"> quit</Text>
    </Text>
  );

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
      marginTop={1}
      borderStyle="single"
      borderTop={true}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor="gray"
    >
      <Box gap={2}>
        {filterActive ? (
          <Text>
            <Text color="gray">/ </Text>
            <Text color="yellowBright">{filter}</Text>
            <Text color="yellowBright" bold>▋</Text>
            <Text color="gray">  <Key k="esc" /> clear</Text>
          </Text>
        ) : filter ? (
          <Text>
            <Text color="gray">filter: </Text>
            <Text color="yellow">{filter}</Text>
            <Text color="gray">  <Key k="/" /> edit  <Key k="esc" /> clear</Text>
          </Text>
        ) : hints}
      </Box>

      <Text color="gray" dimColor>
        {filter && filtered !== total ? `${filtered}/${total}` : total} port{total !== 1 ? 's' : ''}
      </Text>
    </Box>
  );
}
