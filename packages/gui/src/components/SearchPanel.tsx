import { useState, useMemo, useCallback } from 'react';
import type { FieldDef, Record as MasterRecord, Cell } from '@sheetcraft/core';
import { isRichCell } from '@sheetcraft/core';

type Match = { rowIdx: number; fieldName: string };

type Props = {
  mode: 'search' | 'replace';
  fields: FieldDef[];
  records: MasterRecord[];
  onClose: () => void;
  onNavigate: (rowIdx: number, fieldName: string) => void;
  onReplace: (matches: Match[], newValue: string) => void;
};

function getCellString(cell: Cell | Cell[] | undefined): string {
  if (cell === undefined || cell === null) return '';
  if (Array.isArray(cell)) return cell.join(', ');
  if (isRichCell(cell)) return String(cell.value ?? cell.override ?? '');
  return String(cell);
}

export function SearchPanel({ mode, fields, records, onClose, onNavigate, onReplace }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const editableFields = useMemo(
    () => fields.filter((f) => f.editable !== false && !f.auto),
    [fields]
  );

  const matches = useMemo<Match[]>(() => {
    if (!searchTerm) return [];
    const term = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    const result: Match[] = [];
    records.forEach((record, rowIdx) => {
      for (const f of fields) {
        const val = caseSensitive
          ? getCellString(record[f.name] as Cell | undefined)
          : getCellString(record[f.name] as Cell | undefined).toLowerCase();
        if (val.includes(term)) result.push({ rowIdx, fieldName: f.name });
      }
    });
    return result;
  }, [searchTerm, caseSensitive, records, fields]);

  const navigate = useCallback((delta: number) => {
    if (matches.length === 0) return;
    const next = (currentIdx + delta + matches.length) % matches.length;
    setCurrentIdx(next);
    const m = matches[next];
    onNavigate(m.rowIdx, m.fieldName);
  }, [matches, currentIdx, onNavigate]);

  const handleReplace = useCallback((all: boolean) => {
    if (matches.length === 0) return;
    const targets = all ? matches : (matches[currentIdx] ? [matches[currentIdx]] : []);
    onReplace(targets, replaceTerm);
  }, [matches, currentIdx, replaceTerm, onReplace]);

  const editableFieldNames = useMemo(
    () => new Set(editableFields.map((f) => f.name)),
    [editableFields]
  );

  const currentMatchEditable = matches[currentIdx]
    ? editableFieldNames.has(matches[currentIdx].fieldName)
    : false;

  const hasAnyEditableMatch = useMemo(
    () => matches.some((m) => editableFieldNames.has(m.fieldName)),
    [matches, editableFieldNames]
  );

  const matchInfo = matches.length > 0
    ? `${currentIdx + 1} / ${matches.length} 件`
    : searchTerm ? '一致なし' : '';

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <input
          style={styles.input}
          placeholder="検索..."
          value={searchTerm}
          autoFocus
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate(e.shiftKey ? -1 : 1);
            if (e.key === 'Escape') onClose();
          }}
        />
        <span style={styles.matchInfo}>{matchInfo}</span>
        <button style={styles.btn} onClick={() => navigate(-1)} disabled={matches.length === 0}>▲</button>
        <button style={styles.btn} onClick={() => navigate(1)} disabled={matches.length === 0}>▼</button>
        <label style={styles.label}>
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          大小
        </label>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      {mode === 'replace' && (
        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="置換後..."
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          />
          <button
            style={styles.btn}
            onClick={() => handleReplace(false)}
            disabled={matches.length === 0 || !currentMatchEditable}
          >
            置換
          </button>
          <button
            style={styles.btn}
            onClick={() => handleReplace(true)}
            disabled={matches.length === 0 || !hasAnyEditableMatch}
          >
            すべて置換
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 100,
    background: '#fff',
    border: '1px solid #bbb',
    borderRadius: 6,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 340,
  },
  row: { display: 'flex', alignItems: 'center', gap: 4 },
  input: {
    flex: 1,
    fontSize: 13,
    padding: '3px 6px',
    border: '1px solid #ccc',
    borderRadius: 3,
    outline: 'none',
  },
  matchInfo: { fontSize: 11, color: '#888', minWidth: 60, textAlign: 'center' },
  btn: {
    fontSize: 12,
    padding: '3px 7px',
    border: '1px solid #ccc',
    borderRadius: 3,
    background: '#f5f5f5',
    cursor: 'pointer',
  },
  label: { fontSize: 12, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  closeBtn: {
    fontSize: 14,
    padding: '2px 6px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: '#888',
  },
};
