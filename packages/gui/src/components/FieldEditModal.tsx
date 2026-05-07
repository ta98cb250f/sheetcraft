import { useState } from 'react';
import type { FieldDef, ValidationRule, AnomalyRule } from '@sheetcraft/core';

type Props = {
  field: FieldDef;
  onSave: (updated: FieldDef) => void;
  onClose: () => void;
};

const NUM_TYPES = new Set(['int', 'float'] as const);
const STR_TYPES = new Set(['string', 'list<int>', 'list<string>'] as const);

export function FieldEditModal({ field, onSave, onClose }: Props) {
  const [displayName, setDisplayName] = useState(field.display_name ?? '');
  const [exportField, setExportField] = useState(field.export !== false);
  const [editable, setEditable] = useState(field.editable !== false);
  const [formula, setFormula] = useState(field.formula ? `=${field.formula}` : '');

  const [valMin, setValMin] = useState(field.validation?.min !== undefined ? String(field.validation.min) : '');
  const [valMax, setValMax] = useState(field.validation?.max !== undefined ? String(field.validation.max) : '');
  const [valMaxLength, setValMaxLength] = useState(
    field.validation?.max_length !== undefined ? String(field.validation.max_length) : ''
  );
  const [valRegex, setValRegex] = useState(field.validation?.regex ?? '');
  const [valUnique, setValUnique] = useState(field.validation?.unique ?? false);

  const [anomalyWarnAbove, setAnomalyWarnAbove] = useState(
    field.anomaly?.warn_above !== undefined ? String(field.anomaly.warn_above) : ''
  );
  const [anomalyWarnBelow, setAnomalyWarnBelow] = useState(
    field.anomaly?.warn_below !== undefined ? String(field.anomaly.warn_below) : ''
  );

  const isNumeric = NUM_TYPES.has(field.type as 'int' | 'float');
  const isStr = STR_TYPES.has(field.type as 'string' | 'list<int>' | 'list<string>');

  const handleSave = () => {
    const validation: ValidationRule = {};
    if (valMin !== '') validation.min = Number(valMin);
    if (valMax !== '') validation.max = Number(valMax);
    if (valMaxLength !== '') validation.max_length = parseInt(valMaxLength, 10);
    if (valRegex !== '') validation.regex = valRegex;
    if (valUnique) validation.unique = true;
    if (field.validation?.required) validation.required = true;
    if (field.validation?.ref_exists) validation.ref_exists = true;

    const anomaly: AnomalyRule = {};
    if (anomalyWarnAbove !== '') anomaly.warn_above = Number(anomalyWarnAbove);
    if (anomalyWarnBelow !== '') anomaly.warn_below = Number(anomalyWarnBelow);
    if (field.anomaly?.warn_deviation !== undefined) anomaly.warn_deviation = field.anomaly.warn_deviation;
    if (field.anomaly?.warn_delta !== undefined) anomaly.warn_delta = field.anomaly.warn_delta;

    const updated: FieldDef = {
      ...field,
      display_name: displayName.trim() || undefined,
      export: exportField ? undefined : false,
      ...(!field.auto ? { editable: editable ? undefined : false } : {}),
      ...(field.type !== 'enum' ? { formula: formula.trim().startsWith('=') ? formula.trim().slice(1) || undefined : undefined } : {}),
      validation: Object.keys(validation).length > 0 ? validation : undefined,
      anomaly: Object.keys(anomaly).length > 0 ? anomaly : undefined,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div
        style={styles.modal}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      >
        <div style={styles.header}>
          <span style={styles.title}>列の設定: {field.name}</span>
          <span style={styles.typeTag}>{field.type}</span>
        </div>

        <div style={styles.body}>
          <div style={styles.row}>
            <label style={styles.label}>表示名</label>
            <input
              style={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={field.name}
            />
          </div>

          <div style={styles.row}>
            <label style={styles.label}>エクスポート対象</label>
            <input type="checkbox" checked={exportField} onChange={(e) => setExportField(e.target.checked)} />
          </div>

          {!field.auto && (
            <div style={styles.row}>
              <label style={styles.label}>GUI から編集可能</label>
              <input type="checkbox" checked={editable} onChange={(e) => setEditable(e.target.checked)} />
            </div>
          )}

          {field.type !== 'enum' && (
            <div style={styles.row}>
              <label style={styles.label}>計算式</label>
              <input
                style={styles.inputWide}
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
              />
            </div>
          )}

          <div style={styles.sectionHeader}>バリデーション</div>

          {isNumeric && (
            <>
              <div style={styles.row}>
                <label style={styles.label}>最小値</label>
                <input style={styles.inputSmall} type="number" value={valMin} onChange={(e) => setValMin(e.target.value)} />
              </div>
              <div style={styles.row}>
                <label style={styles.label}>最大値</label>
                <input style={styles.inputSmall} type="number" value={valMax} onChange={(e) => setValMax(e.target.value)} />
              </div>
            </>
          )}

          {isStr && (
            <div style={styles.row}>
              <label style={styles.label}>最大長</label>
              <input style={styles.inputSmall} type="number" min={1} value={valMaxLength} onChange={(e) => setValMaxLength(e.target.value)} />
            </div>
          )}

          {field.type === 'string' && (
            <div style={styles.row}>
              <label style={styles.label}>正規表現</label>
              <input
                style={styles.inputWide}
                value={valRegex}
                onChange={(e) => setValRegex(e.target.value)}
                placeholder="例: ^[A-Z][0-9]+$"
              />
            </div>
          )}

          <div style={styles.row}>
            <label style={styles.label}>重複禁止</label>
            <input type="checkbox" checked={valUnique} onChange={(e) => setValUnique(e.target.checked)} />
          </div>

          {isNumeric && (
            <>
              <div style={styles.sectionHeader}>異常値警告</div>
              <div style={styles.row}>
                <label style={styles.label}>上限警告</label>
                <input style={styles.inputSmall} type="number" value={anomalyWarnAbove} onChange={(e) => setAnomalyWarnAbove(e.target.value)} />
              </div>
              <div style={styles.row}>
                <label style={styles.label}>下限警告</label>
                <input style={styles.inputSmall} type="number" value={anomalyWarnBelow} onChange={(e) => setAnomalyWarnBelow(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>キャンセル</button>
          <button style={styles.saveBtn} onClick={handleSave}>保存</button>
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
    width: 420, maxWidth: '95vw', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 18px', borderBottom: '1px solid #eee',
  },
  title: { fontWeight: 700, fontSize: 15, flex: 1 },
  typeTag: {
    fontSize: 11, padding: '2px 7px', borderRadius: 4,
    background: '#e8f0fe', color: '#1a73e8', fontFamily: 'monospace',
  },
  body: { flex: 1, overflowY: 'auto', padding: '10px 18px' },
  sectionHeader: {
    fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase',
    margin: '12px 0 6px',
  },
  row: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { fontSize: 13, color: '#444', width: 140, flexShrink: 0 },
  input: { fontSize: 13, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, flex: 1 },
  inputWide: { fontSize: 13, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, flex: 1 },
  inputSmall: { fontSize: 13, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, width: 100 },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '12px 18px', borderTop: '1px solid #eee',
  },
  cancelBtn: {
    padding: '6px 16px', fontSize: 13, cursor: 'pointer',
    border: '1px solid #ccc', borderRadius: 4, background: '#fff',
  },
  saveBtn: {
    padding: '6px 16px', fontSize: 13, cursor: 'pointer',
    border: '1px solid #1557b0', borderRadius: 4,
    background: '#1a73e8', color: '#fff', fontWeight: 600,
  },
};
