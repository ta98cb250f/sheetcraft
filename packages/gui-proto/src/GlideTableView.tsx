import { useCallback, useMemo, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from './ContextMenu.js';
import {
  DataEditor,
  GridCellKind,
  type GridCell,
  type GridColumn,
  type Item,
  type EditableGridCell,
  type HeaderClickedEventArgs,
  type CellClickedEventArgs,
  type DrawCellCallback,
  type GridSelection,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import type {
  TableFile,
  FieldDef,
  CellColorsConfig,
  ValidationResult,
  Cell,
  RichCell,
  SimpleCell,
} from '@sheetcraft/core';
import { isRichCell, computeRecord } from '@sheetcraft/core';

type Props = {
  table: TableFile;
  fields: FieldDef[];
  cellColors: CellColorsConfig | null;
  validation: ValidationResult | null;
  onChange: (table: TableFile) => void;
};

function isFieldEditable(field: FieldDef): boolean {
  return field.editable !== false && field.auto !== 'increment';
}

function applyEdit(field: FieldDef, existing: Cell | undefined, raw: string): Cell | Cell[] | undefined {
  if (raw.startsWith('=') && raw.length > 1) {
    const formula = raw.slice(1);
    if (existing !== undefined && isRichCell(existing)) {
      return { ...(existing as RichCell), override: formula, value: undefined };
    }
    return { override: formula };
  }
  let parsed: SimpleCell | Cell[];
  if (field.type === 'int') {
    const n = parseInt(raw.trim(), 10);
    if (isNaN(n)) return existing;
    parsed = n;
  } else if (field.type === 'float') {
    const n = parseFloat(raw.trim());
    if (isNaN(n)) return existing;
    parsed = n;
  } else if (field.type === 'bool') {
    parsed = raw === 'true' || raw === '1';
  } else if (field.type === 'list<int>') {
    parsed = raw.split(',').map((s) => parseInt(s.trim(), 10) || 0);
  } else if (field.type === 'list<string>') {
    parsed = raw.split(',').map((s) => s.trim());
  } else {
    parsed = raw;
  }
  if (existing !== undefined && isRichCell(existing)) {
    return { ...(existing as RichCell), value: parsed as SimpleCell, override: undefined };
  }
  return parsed;
}

export function GlideTableView({ table, fields, cellColors, validation, onChange }: Props) {
  const columns = useMemo<GridColumn[]>(() => {
    return fields.map((f) => ({
      id: f.name,
      title: f.display_name ?? f.name,
      width: table.column_widths?.[f.name] ?? 140,
    }));
  }, [fields, table.column_widths]);

  const computedRecords = useMemo(
    () => table.records.map((r) => computeRecord(r, fields)),
    [table.records, fields]
  );

  const errSet = useMemo(
    () => new Set<string>(validation?.errors.map((e) => `${e.recordIndex}:${e.field}`) ?? []),
    [validation]
  );
  const warnSet = useMemo(
    () => new Set<string>(validation?.warnings.map((w) => `${w.recordIndex}:${w.field}`) ?? []),
    [validation]
  );

  const getCellContent = useCallback((cell: Item): GridCell => {
    const [col, row] = cell;
    const field = fields[col];
    if (!field) {
      return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false };
    }
    const record = table.records[row];
    const computed = computedRecords[row];
    const raw = record?.[field.name];
    const computedVal = computed?.[field.name];
    const editable = isFieldEditable(field);
    const rich = isRichCell(raw as Cell) ? (raw as RichCell) : null;

    if (field.type === 'bool') {
      const v = rich ? rich.value : raw;
      return {
        kind: GridCellKind.Boolean,
        data: !!v,
        allowOverlay: false,
        readonly: !editable,
      };
    }
    // enum / list は Bubble ではなく Text にして編集可能にする（Bubble は read-only）
    if (field.type === 'enum') {
      const v = rich ? rich.value : raw;
      const text = v !== undefined && v !== null ? String(v) : '';
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: editable,
        readonly: !editable,
      };
    }
    if (field.type === 'list<int>' || field.type === 'list<string>') {
      const arr = Array.isArray(raw) ? (raw as (string | number)[]) : [];
      const text = arr.join(', ');
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: editable,
        readonly: !editable,
      };
    }
    // int / float / string / その他は Text として扱い、`=` 式入力を許可
    const displayStr = computedVal !== undefined && computedVal !== null
      ? Array.isArray(computedVal) ? computedVal.join(', ') : String(computedVal)
      : '';
    const editText = rich?.override ? `=${rich.override}` : displayStr;
    return {
      kind: GridCellKind.Text,
      data: editText,
      displayData: displayStr,
      allowOverlay: editable,
      readonly: !editable,
    };
  }, [fields, table.records, computedRecords]);

  // 単一セル更新の基本経路。onCellEdited / 右クリックメニュー双方から使う。
  const updateCell = useCallback((row: number, fieldName: string, next: Cell | Cell[] | undefined) => {
    const newRecords = table.records.map((r, i) => (i === row ? { ...r, [fieldName]: next } : r));
    onChange({ ...table, records: newRecords });
  }, [table, onChange]);

  const onCellEdited = useCallback((cell: Item, newValue: EditableGridCell) => {
    const [col, row] = cell;
    const field = fields[col];
    if (!field || !isFieldEditable(field)) return;
    const existing = table.records[row]?.[field.name] as Cell | undefined;
    let next: Cell | Cell[] | undefined;

    if (newValue.kind === GridCellKind.Text) {
      next = applyEdit(field, existing, String(newValue.data ?? ''));
    } else if (newValue.kind === GridCellKind.Number) {
      const n = newValue.data;
      const raw = n !== undefined && n !== null ? String(n) : '';
      next = applyEdit(field, existing, raw);
    } else if (newValue.kind === GridCellKind.Boolean) {
      next = !!newValue.data;
      if (existing !== undefined && isRichCell(existing)) {
        next = { ...(existing as RichCell), value: next as SimpleCell, override: undefined };
      }
    } else {
      return;
    }
    if (next === undefined) return;
    updateCell(row, field.name, next);
  }, [fields, table.records, updateCell]);

  // 範囲コピー / ペースト / Delete の値取得経路。
  // `true` (リテラル) を渡す基本実装が機能しないケースがあるため、関数で明示する。
  const getCellsForSelection = useCallback((selection: { x: number; y: number; width: number; height: number }) => {
    const cells: GridCell[][] = [];
    for (let r = selection.y; r < selection.y + selection.height; r++) {
      const row: GridCell[] = [];
      for (let c = selection.x; c < selection.x + selection.width; c++) {
        row.push(getCellContent([c, r]));
      }
      cells.push(row);
    }
    return cells;
  }, [getCellContent]);

  // TSV ペーストを範囲全体に展開する手動実装。
  // false を返すと Glide のデフォルト処理（フォーカスセルへの単体貼付）を抑制する。
  const onPaste = useCallback((target: Item, values: readonly (readonly string[])[]) => {
    const [startCol, startRow] = target;
    const newRecords = [...table.records];
    values.forEach((rowVals, dr) => {
      const recordIdx = startRow + dr;
      if (recordIdx < 0 || recordIdx >= newRecords.length) return;
      const record = { ...newRecords[recordIdx] };
      rowVals.forEach((val, dc) => {
        const colIdx = startCol + dc;
        const field = fields[colIdx];
        if (!field || !isFieldEditable(field)) return;
        const existing = record[field.name] as Cell | undefined;
        const next = applyEdit(field, existing, val);
        if (next === undefined) return;
        record[field.name] = next;
      });
      newRecords[recordIdx] = record;
    });
    onChange({ ...table, records: newRecords });
    return false;
  }, [fields, table, onChange]);

  // Delete / Backspace で選択範囲全体をクリアする手動実装。
  // 範囲セレクションがある場合はそれを優先、なければデフォルト動作（フォーカスセル）に任せる。
  const onDelete = useCallback((selection: GridSelection) => {
    const range = selection.current?.range;
    if (!range) return true;
    const newRecords = [...table.records];
    for (let r = range.y; r < range.y + range.height; r++) {
      if (r < 0 || r >= newRecords.length) continue;
      const record = { ...newRecords[r] };
      for (let c = range.x; c < range.x + range.width; c++) {
        const field = fields[c];
        if (!field || !isFieldEditable(field)) continue;
        const existing = record[field.name] as Cell | undefined;
        if (existing === undefined) continue;
        if (isRichCell(existing as Cell)) {
          const rich = existing as RichCell;
          // 色 / コメントは保持、value / override のみ消す
          if (rich.color !== undefined || rich.comment !== undefined) {
            record[field.name] = { color: rich.color, comment: rich.comment };
          } else {
            delete record[field.name];
          }
        } else {
          delete record[field.name];
        }
      }
      newRecords[r] = record;
    }
    onChange({ ...table, records: newRecords });
    return false;
  }, [fields, table, onChange]);

  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const onHeaderContextMenu = useCallback((colIdx: number, args: HeaderClickedEventArgs) => {
    args.preventDefault();
    const field = fields[colIdx];
    if (!field) return;
    // bounds はキャンバス上のセル/ヘッダー矩形、localEventX/Y はその矩形内のオフセット。
    // 両者を加算してビューポート座標を得る（プロト範囲ではこれで十分機能している）
    const x = (args.bounds?.x ?? 0) + (args.localEventX ?? 0);
    const y = (args.bounds?.y ?? 0) + (args.localEventY ?? 0);
    setMenu({
      x, y,
      items: [
        { type: 'item', label: 'この列の設定を編集（未実装）', action: () => console.log('settings', field.name) },
        { type: 'item', label: 'この列を左に固定（未実装）', action: () => console.log('pin', field.name) },
        { type: 'separator' },
        { type: 'item', label: 'この列を削除（未実装）', action: () => console.log('delete', field.name), danger: true },
      ],
    });
  }, [fields]);

  const onCellContextMenu = useCallback((cell: Item, args: CellClickedEventArgs) => {
    args.preventDefault();
    const [col, row] = cell;
    const field = fields[col];
    if (!field) return;
    const x = (args.bounds?.x ?? 0) + (args.localEventX ?? 0);
    const y = (args.bounds?.y ?? 0) + (args.localEventY ?? 0);
    const existing = table.records[row]?.[field.name] as Cell | undefined;

    const items: ContextMenuItem[] = [];
    // 色サブメニュー（プロトでは各色を個別項目として展開）
    if (cellColors) {
      for (const [key, def] of Object.entries(cellColors.cell_colors)) {
        items.push({
          type: 'item',
          label: `■ 色: ${def.label ?? key}`,
          action: () => {
            const next: RichCell = isRichCell(existing as Cell)
              ? { ...(existing as RichCell), color: key }
              : { value: existing as SimpleCell, color: key };
            updateCell(row, field.name, next);
          },
        });
      }
      items.push({
        type: 'item',
        label: '色をクリア',
        action: () => {
          if (!isRichCell(existing as Cell)) return;
          const r = existing as RichCell;
          const next: Cell = { ...r, color: undefined };
          updateCell(row, field.name, next);
        },
      });
      items.push({ type: 'separator' });
    }
    items.push({
      type: 'item',
      label: 'コメントを編集',
      action: () => {
        const c = window.prompt('コメント:', isRichCell(existing as Cell) ? ((existing as RichCell).comment ?? '') : '');
        if (c === null) return;
        const next: RichCell = isRichCell(existing as Cell)
          ? { ...(existing as RichCell), comment: c || undefined }
          : { value: existing as SimpleCell, comment: c || undefined };
        updateCell(row, field.name, next);
      },
    });
    items.push({
      type: 'item',
      label: '式をオーバーライド',
      action: () => {
        const f = window.prompt('式（=なし、空で解除）:', isRichCell(existing as Cell) ? ((existing as RichCell).override ?? '') : '');
        if (f === null) return;
        const next: RichCell = isRichCell(existing as Cell)
          ? { ...(existing as RichCell), override: f || undefined, value: f ? undefined : (existing as RichCell).value }
          : { override: f || undefined };
        updateCell(row, field.name, next);
      },
    });
    setMenu({ x, y, items });
  }, [fields, table, cellColors, updateCell]);

  // DrawCellCallback シグネチャ: (args, drawContent) => void
  // drawContent() を呼ぶとライブラリ標準の描画を実行、その前後に独自描画を重ねる
  const drawCell = useCallback<DrawCellCallback>((args, drawContent) => {
    const { ctx, rect, col, row } = args;
    const field = fields[col];
    if (!field) { drawContent(); return; }
    const raw = table.records[row]?.[field.name] as Cell | undefined;
    const rich = isRichCell(raw as Cell) ? (raw as RichCell) : null;

    // 塗り色背景（先に塗ってから標準描画でテキストを重ねる）
    if (rich?.color && cellColors?.cell_colors[rich.color]) {
      ctx.save();
      ctx.fillStyle = cellColors.cell_colors[rich.color].hex + '55';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
    }

    // 標準テキスト描画
    drawContent();

    // バリデーション枠（err/warn がそもそも無ければキー文字列生成もスキップ）
    const hasErr = errSet.size > 0 && errSet.has(`${row}:${field.name}`);
    const hasWarn = !hasErr && warnSet.size > 0 && warnSet.has(`${row}:${field.name}`);
    if (hasErr || hasWarn) {
      ctx.save();
      ctx.strokeStyle = hasErr ? '#e53935' : '#fdd835';
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
      ctx.restore();
    }

    // コメント三角
    if (rich?.comment) {
      ctx.save();
      ctx.fillStyle = '#f57c00';
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.width, rect.y);
      ctx.lineTo(rect.x + rect.width - 7, rect.y);
      ctx.lineTo(rect.x + rect.width, rect.y + 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // fx マーカー
    if (rich?.override) {
      ctx.save();
      ctx.fillStyle = '#1a73e8';
      ctx.font = 'bold 9px sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText('fx', rect.x + rect.width - 13, rect.y + rect.height - 2);
      ctx.restore();
    }
  }, [fields, table.records, cellColors, errSet, warnSet]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DataEditor
        columns={columns}
        rows={table.records.length}
        getCellContent={getCellContent}
        onCellEdited={onCellEdited}
        onPaste={onPaste}
        onDelete={onDelete}
        onHeaderContextMenu={onHeaderContextMenu}
        onCellContextMenu={onCellContextMenu}
        drawCell={drawCell}
        rangeSelect="rect"
        getCellsForSelection={getCellsForSelection}
        fillHandle
        smoothScrollX
        smoothScrollY
        width="100%"
        height="100%"
        rowMarkers="checkbox-visible"
        keybindings={{ search: true, copy: true, paste: true, selectAll: true }}
      />
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
