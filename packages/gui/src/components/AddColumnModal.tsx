import { useState } from 'react';
import type { FieldDef, FieldType } from '@sheetcraft/core';

type Props = {
  existingNames: Set<string>;
  onAdd: (field: FieldDef) => void;
  onClose: () => void;
};

const FIELD_TYPES: FieldType[] = [
  'int', 'float', 'string', 'bool', 'enum', 'list<int>', 'list<string>',
];

const NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

export function AddColumnModal({ existingNames, onAdd, onClose }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('string');
  const [displayName, setDisplayName] = useState('');
  const [exportField, setExportField] = useState(true);
  const [nameError, setNameError] = useState('');

  const validateName = (value: string) => {
    if (!value.trim()) return '列名は必須です';
    if (!NAME_PATTERN.test(value)) return '英小文字・数字・アンダースコアのみ（先頭は英字またはアンダースコア）';
    if (existingNames.has(value)) return 'その列名は既に使われています';
    return '';
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setNameError(validateName(value));
  };

  const handleAdd = () => {
    const err = validateName(name);
    if (err) { setNameError(err); return; }

    const field: FieldDef = {
      name: name.trim(),
      type,
      ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
      ...(!exportField ? { export: false } : {}),
    };
    onAdd(field);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div style={styles.header}>
          <span style={styles.title}>列を追加</span>
        </div>

        <div style={styles.body}>
          <div style={styles.row}>
            <label style={styles.label}>列名 <span style={styles.required}>*</span></label>
            <div style={styles.inputGroup}>
              <input
                style={{ ...styles.input, ...(nameError ? styles.inputError : {}) }}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="例: attack_power"
                autoFocus
              />
              {nameError && <div style={styles.errorMsg}>{nameError}</div>}
              <div style={styles.hint}>英小文字・数字・アンダースコア（先頭は英字または _）</div>
            </div>
          </div>

          <div style={styles.row}>
            <label style={styles.label}>型 <span style={styles.required}>*</span></label>
            <select style={styles.select} value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={styles.row}>
            <label style={styles.label}>表示名</label>
            <input
              style={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="省略時は列名をそのまま使用"
            />
          </div>

          <div style={styles.row}>
            <label style={styles.label}>エクスポート対象</label>
            <input type="checkbox" checked={exportField} onChange={(e) => setExportField(e.target.checked)} />
          </div>

          {(type === 'enum') && (
            <div style={styles.note}>
              ※ enum_ref の設定は JSON ファイルを直接編集してください
            </div>
          )}
          {(type !== 'enum') && (
            <div style={styles.note}>
              ※ 計算式は追加後に「列の設定を編集」から設定できます
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>キャンセル</button>
          <button style={styles.addBtn} onClick={handleAdd} disabled={!!nameError || !name.trim()}>
            追加
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
    width: 420, maxWidth: '95vw',
    display: 'flex', flexDirection: 'column',
  },
  header: { padding: '14px 18px', borderBottom: '1px solid #eee' },
  title: { fontWeight: 700, fontSize: 15 },
  body: { padding: '12px 18px' },
  row: { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  label: { fontSize: 13, color: '#444', width: 130, flexShrink: 0, paddingTop: 5 },
  required: { color: '#e53935' },
  inputGroup: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  input: { fontSize: 13, padding: '5px 8px', border: '1px solid #ccc', borderRadius: 4, width: '100%', boxSizing: 'border-box' },
  inputError: { borderColor: '#e53935' },
  errorMsg: { fontSize: 11, color: '#e53935' },
  hint: { fontSize: 11, color: '#999' },
  select: { fontSize: 13, padding: '5px 8px', border: '1px solid #ccc', borderRadius: 4, flex: 1 },
  note: {
    fontSize: 12, color: '#888', background: '#f5f5f5',
    borderRadius: 4, padding: '6px 10px', marginTop: 4,
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '12px 18px', borderTop: '1px solid #eee',
  },
  cancelBtn: {
    padding: '6px 16px', fontSize: 13, cursor: 'pointer',
    border: '1px solid #ccc', borderRadius: 4, background: '#fff',
  },
  addBtn: {
    padding: '6px 16px', fontSize: 13, cursor: 'pointer',
    border: '1px solid #1557b0', borderRadius: 4,
    background: '#1a73e8', color: '#fff', fontWeight: 600,
  },
};
