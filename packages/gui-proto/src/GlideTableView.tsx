import { useCallback, useMemo } from 'react';
import {
  DataEditor,
  GridCellKind,
  type GridCell,
  type GridColumn,
  type Item,
  type EditableGridCell,
  type FillPatternEventArgs,
  type HeaderClickedEventArgs,
  type CellClickedEventArgs,
  type DrawCellCallback,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import type {
  TableFile,
  FieldDef,
  EnumsConfig,
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
  enums: EnumsConfig | null;
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

  const errSet = useMemo(() => {
    const s = new Set<string>();
    validation?.errors.forEach((e) => s.add(`${e.recordIndex}:${e.field}`));
    return s;
  }, [validation]);

  const warnSet = useMemo(() => {
    const s = new Set<string>();
    validation?.warnings.forEach((w) => s.add(`${w.recordIndex}:${w.field}`));
    return s;
  }, [validation]);

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
    const isRich = isRichCell(raw as Cell);
    const override = isRich ? (raw as RichCell).override : undefined;

    if (field.type === 'bool') {
      const v = isRich ? (raw as RichCell).value : raw;
      return {
        kind: GridCellKind.Boolean,
        data: !!v,
        allowOverlay: false,
        readonly: !editable,
      };
    }
    // enum / list は Bubble ではなく Text にして編集可能にする（Bubble は read-only）
    if (field.type === 'enum') {
      const v = isRich ? (raw as RichCell).value : raw;
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
    const editText = override ? `=${override}` : displayStr;
    return {
      kind: GridCellKind.Text,
      data: editText,
      displayData: displayStr,
      allowOverlay: editable,
      readonly: !editable,
    };
  }, [fields, table.records, computedRecords]);

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
    const newRecords = table.records.map((r, i) => (i === row ? { ...r, [field.name]: next } : r));
    onChange({ ...table, records: newRecords });
  }, [fields, table, onChange]);

  const onFillPattern = useCallback((e: FillPatternEventArgs) => {
    // Glide Data Grid v6 は onCellEdited をフィル範囲分呼び出すので、
    // 追加処理は不要。ここではトレース用。
    console.log('[proto] onFillPattern', e.fillDestination, e.patternSource);
  }, []);

  const onHeaderContextMenu = useCallback((colIdx: number, args: HeaderClickedEventArgs) => {
    args.preventDefault();
    const field = fields[colIdx];
    if (!field) return;
    const action = window.prompt(
      `[${field.display_name ?? field.name}] ヘッダー右クリック (proto)\nコマンド: settings / delete`,
      'settings'
    );
    console.log('[proto] header context menu', field.name, action);
  }, [fields]);

  const onCellContextMenu = useCallback((cell: Item, args: CellClickedEventArgs) => {
    args.preventDefault();
    const [col, row] = cell;
    const field = fields[col];
    if (!field) return;
    const action = window.prompt(
      `[${field.display_name ?? field.name}] 行 ${row + 1} 右クリック (proto)\nコマンド: color / comment / override`,
      'color'
    );
    if (!action) return;
    const existing = table.records[row]?.[field.name] as Cell | undefined;
    let next: Cell | undefined;
    if (action === 'color' && cellColors) {
      const key = Object.keys(cellColors.cell_colors)[0];
      next = isRichCell(existing as Cell)
        ? { ...(existing as RichCell), color: key }
        : { value: existing as SimpleCell, color: key };
    } else if (action === 'comment') {
      const c = window.prompt('コメント:', isRichCell(existing as Cell) ? ((existing as RichCell).comment ?? '') : '');
      if (c === null) return;
      next = isRichCell(existing as Cell)
        ? { ...(existing as RichCell), comment: c || undefined }
        : { value: existing as SimpleCell, comment: c || undefined };
    } else if (action === 'override') {
      const f = window.prompt('式（=なし）:', isRichCell(existing as Cell) ? ((existing as RichCell).override ?? '') : '');
      if (f === null) return;
      next = isRichCell(existing as Cell)
        ? { ...(existing as RichCell), override: f || undefined, value: undefined }
        : { override: f || undefined };
    } else {
      return;
    }
    const newRecords = table.records.map((r, i) => (i === row ? { ...r, [field.name]: next } : r));
    onChange({ ...table, records: newRecords });
  }, [fields, table, cellColors, onChange]);

  // DrawCellCallback シグネチャ: (args, drawContent) => void
  // drawContent() を呼ぶとライブラリ標準の描画を実行、その前後に独自描画を重ねる
  const drawCell = useCallback<DrawCellCallback>((args, drawContent) => {
    const { ctx, rect, col, row } = args;
    const field = fields[col];
    if (!field) { drawContent(); return; }
    const raw = table.records[row]?.[field.name] as Cell | undefined;
    const key = `${row}:${field.name}`;
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

    // バリデーション枠
    const hasErr = errSet.has(key);
    const hasWarn = warnSet.has(key);
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
    <DataEditor
      columns={columns}
      rows={table.records.length}
      getCellContent={getCellContent}
      onCellEdited={onCellEdited}
      onFillPattern={onFillPattern}
      onHeaderContextMenu={onHeaderContextMenu}
      onCellContextMenu={onCellContextMenu}
      drawCell={drawCell}
      rangeSelect="multi-cell"
      fillHandle
      smoothScrollX
      smoothScrollY
      width="100%"
      height="100%"
      rowMarkers="checkbox-visible"
    />
  );
}
