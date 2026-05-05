import type { ValidationResult } from '@sheetcraft/core';

type Props = {
  hasFolder: boolean;
  hasTable: boolean;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  validation: ValidationResult | null;
  savedFolderName: string | null;
  onOpenFolder: () => void;
  onReopenLastFolder: () => void;
  onSave: () => void;
  onAddRow: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function Toolbar({
  hasFolder, hasTable, isDirty, canUndo, canRedo, validation,
  savedFolderName, onOpenFolder, onReopenLastFolder, onSave, onAddRow, onUndo, onRedo,
}: Props) {
  const errorCount = validation?.errors.length ?? 0;
  const warnCount = validation?.warnings.length ?? 0;

  return (
    <header style={styles.bar}>
      <span style={styles.title}>SheetCraft</span>
      <div style={styles.actions}>
        <button style={styles.btn} onClick={onOpenFolder}>
          フォルダを開く
        </button>
        {!hasFolder && savedFolderName && (
          <button style={styles.btn} onClick={onReopenLastFolder} title={`最近のフォルダ: ${savedFolderName}`}>
            再度開く: {savedFolderName}
          </button>
        )}
        {hasFolder && hasTable && (
          <>
            <div style={styles.separator} />
            <button style={styles.btnIcon} onClick={onUndo} disabled={!canUndo} title="元に戻す (Ctrl+Z)">
              ↩
            </button>
            <button style={styles.btnIcon} onClick={onRedo} disabled={!canRedo} title="やり直す (Ctrl+Y)">
              ↪
            </button>
            <div style={styles.separator} />
            <button style={styles.btn} onClick={onAddRow} title="行を追加">
              ＋ 行を追加
            </button>
            <button
              style={{ ...styles.btn, ...(isDirty ? styles.btnPrimary : {}) }}
              onClick={onSave}
              disabled={!isDirty}
            >
              保存{isDirty ? ' *' : ''}
            </button>
          </>
        )}
        {validation && (
          <div style={styles.validationBadge}>
            {errorCount > 0 && (
              <span style={styles.errorBadge}>✕ {errorCount}</span>
            )}
            {warnCount > 0 && (
              <span style={styles.warnBadge}>⚠ {warnCount}</span>
            )}
            {errorCount === 0 && warnCount === 0 && (
              <span style={styles.okBadge}>✓ OK</span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    height: 48,
    borderBottom: '1px solid #ddd',
    background: '#fff',
    flexShrink: 0,
    gap: 8,
  },
  title: { fontWeight: 700, fontSize: 16, color: '#1a73e8', marginRight: 'auto' },
  actions: { display: 'flex', alignItems: 'center', gap: 6 },
  separator: { width: 1, height: 24, background: '#ddd', margin: '0 4px' },
  btn: {
    padding: '5px 12px',
    fontSize: 13,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  btnIcon: {
    padding: '4px 8px',
    fontSize: 16,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
    lineHeight: 1,
  },
  btnPrimary: { background: '#1a73e8', color: '#fff', border: '1px solid #1557b0' },
  validationBadge: { display: 'flex', gap: 4, marginLeft: 4 },
  errorBadge: {
    fontSize: 12, padding: '2px 8px', borderRadius: 10,
    background: '#ffebee', color: '#c62828', fontWeight: 600,
  },
  warnBadge: {
    fontSize: 12, padding: '2px 8px', borderRadius: 10,
    background: '#fff8e1', color: '#f57f17', fontWeight: 600,
  },
  okBadge: {
    fontSize: 12, padding: '2px 8px', borderRadius: 10,
    background: '#e8f5e9', color: '#2e7d32', fontWeight: 600,
  },
};
