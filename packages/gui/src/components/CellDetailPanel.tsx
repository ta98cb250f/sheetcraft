import type { Cell, RichCell, CellColorsConfig } from '@sheetcraft/core';
import { isRichCell } from '@sheetcraft/core';

type Props = {
  fieldName: string | null;
  cell: Cell | null;
  cellColors: CellColorsConfig | null;
  onUpdate: (cell: Cell) => void;
  readonly?: boolean;
};

export function CellDetailPanel({ fieldName, cell, cellColors, onUpdate, readonly = false }: Props) {
  if (!fieldName || cell === null) {
    return (
      <div style={styles.panel}>
        <div style={styles.empty}>セルを選択してください</div>
      </div>
    );
  }

  const rich = isRichCell(cell) ? (cell as RichCell) : null;
  const value = rich ? rich.value : cell;
  const color = rich?.color ?? '';
  const comment = rich?.comment ?? '';

  const makeRich = (patch: Partial<RichCell>): RichCell => ({
    ...(rich ?? {}),
    ...patch,
  });

  const cleanRich = (r: RichCell): Cell => {
    if (!r.color && !r.comment && r.override === undefined) {
      return r.value ?? (cell as Cell);
    }
    return r;
  };

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <label style={styles.label}>値</label>
        <input
          style={{ ...styles.input, ...(readonly ? { background: '#f5f5f5', color: '#888' } : {}) }}
          value={String(value ?? '')}
          readOnly={readonly}
          onChange={readonly ? undefined : (e) => {
            const raw = e.target.value;
            const num = Number(raw);
            const newVal = raw === '' ? undefined : isNaN(num) ? raw : num;
            onUpdate(cleanRich(makeRich({ value: newVal })));
          }}
        />
      </div>
      <div style={styles.row}>
        <label style={styles.label}>色</label>
        <select
          style={styles.select}
          value={color}
          onChange={(e) => onUpdate(cleanRich(makeRich({ color: e.target.value || undefined })))}
        >
          <option value="">なし</option>
          {cellColors
            ? Object.entries(cellColors.cell_colors).map(([key, def]) => (
                <option key={key} value={key}>
                  {def.label ?? key}
                </option>
              ))
            : null}
        </select>
        {color && cellColors?.cell_colors[color] && (
          <span
            style={{
              ...styles.colorSwatch,
              background: cellColors.cell_colors[color].hex,
            }}
          />
        )}
      </div>
      <div style={styles.row}>
        <label style={styles.label}>コメント</label>
        <textarea
          style={styles.textarea}
          value={comment}
          onChange={(e) => onUpdate(cleanRich(makeRich({ comment: e.target.value || undefined })))}
        />
      </div>
      {rich?.override !== undefined && (
        <div style={styles.row}>
          <label style={styles.label}>式</label>
          <input
            style={styles.input}
            value={rich.override}
            onChange={(e) => onUpdate(makeRich({ override: e.target.value || undefined }))}
          />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    padding: 16,
    borderTop: '1px solid #ddd',
    background: '#fff',
    minHeight: 140,
  },
  empty: { color: '#aaa', fontSize: 13 },
  row: { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  label: { width: 60, fontSize: 12, color: '#555', paddingTop: 4, flexShrink: 0 },
  input: { flex: 1, fontSize: 13, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 3 },
  select: { flex: 1, fontSize: 13, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 3 },
  textarea: { flex: 1, fontSize: 13, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 3, resize: 'vertical', minHeight: 48 },
  colorSwatch: { width: 20, height: 20, borderRadius: 3, border: '1px solid #ccc', flexShrink: 0 },
};
