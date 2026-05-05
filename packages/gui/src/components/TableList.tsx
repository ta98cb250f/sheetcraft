import type { TableFile } from '@sheetcraft/core';

type Props = {
  tableNames: string[];
  tables: Map<string, TableFile>;
  selected: string | null;
  onSelect: (name: string) => void;
};

export function TableList({ tableNames, tables, selected, onSelect }: Props) {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.header}>テーブル一覧</div>
      <ul style={styles.list}>
        {tableNames.map((name) => {
          const table = tables.get(name);
          return (
            <li
              key={name}
              style={{
                ...styles.item,
                ...(selected === name ? styles.itemSelected : {}),
              }}
              onClick={() => onSelect(name)}
            >
              <span style={styles.bullet}>{selected === name ? '●' : '○'}</span>
              <span style={styles.label}>
                {table?.display_name ?? name.replace('.json', '')}
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 200,
    borderRight: '1px solid #ddd',
    display: 'flex',
    flexDirection: 'column',
    background: '#fafafa',
    flexShrink: 0,
  },
  header: {
    padding: '12px 16px',
    fontWeight: 600,
    fontSize: 13,
    borderBottom: '1px solid #ddd',
    color: '#555',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    overflowY: 'auto',
    flex: 1,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 13,
    borderBottom: '1px solid #f0f0f0',
  },
  itemSelected: {
    background: '#e8f0fe',
    color: '#1a73e8',
    fontWeight: 600,
  },
  bullet: { fontSize: 10 },
  label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
