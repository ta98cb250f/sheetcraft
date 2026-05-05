type Props = {
  hasFolder: boolean;
  isDirty: boolean;
  onOpenFolder: () => void;
  onSave: () => void;
  onValidate: () => void;
};

export function Toolbar({ hasFolder, isDirty, onOpenFolder, onSave, onValidate }: Props) {
  return (
    <header style={styles.bar}>
      <span style={styles.title}>SheetCraft</span>
      <div style={styles.actions}>
        <button style={styles.btn} onClick={onOpenFolder}>
          フォルダを開く
        </button>
        {hasFolder && (
          <>
            <button
              style={{ ...styles.btn, ...(isDirty ? styles.btnPrimary : {}) }}
              onClick={onSave}
              disabled={!isDirty}
            >
              保存
            </button>
            <button style={styles.btn} onClick={onValidate}>
              バリデーション
            </button>
          </>
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
    gap: 12,
  },
  title: { fontWeight: 700, fontSize: 16, color: '#1a73e8', marginRight: 'auto' },
  actions: { display: 'flex', gap: 8 },
  btn: {
    padding: '6px 14px',
    fontSize: 13,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
  btnPrimary: { background: '#1a73e8', color: '#fff', border: '1px solid #1557b0' },
};
