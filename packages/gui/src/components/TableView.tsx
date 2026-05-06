import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import '../grid-overrides.css';
import type {
  ColDef,
  CellValueChangedEvent,
  CellClickedEvent,
  CellContextMenuEvent,
  CellFocusedEvent,
  Column,
  ICellRendererParams,
  RowDragEndEvent,
} from 'ag-grid-community';
import { ContextMenu } from './ContextMenu.js';
import type { MenuItem } from './ContextMenu.js';
import type {
  TableFile,
  Record as MasterRecord,
  Cell,
  RichCell,
  SimpleCell,
  FieldDef,
  EnumsConfig,
  CellColorsConfig,
  BaseFieldsConfig,
  ValidationResult,
} from '@sheetcraft/core';
import { isRichCell, resolveFields, computeRecord } from '@sheetcraft/core';
import { CellDetailPanel } from './CellDetailPanel.js';
import { SearchPanel } from './SearchPanel.js';
import { FieldEditModal } from './FieldEditModal.js';
import { AddColumnModal } from './AddColumnModal.js';

type Props = {
  table: TableFile;
  enums: EnumsConfig | null;
  cellColors: CellColorsConfig | null;
  baseFields: BaseFieldsConfig | null;
  validation: ValidationResult | null;
  onSave: (table: TableFile) => void;
  onAddRow: () => void;
  onDeleteRow: (recordIndex: number) => void;
  addColumnOpen?: boolean;
  onAddColumnOpenChange?: (open: boolean) => void;
};

function getCellDisplayValue(cell: Cell | Cell[] | undefined): unknown {
  if (cell === undefined || cell === null) return '';
  if (Array.isArray(cell)) return cell.join(', ');
  if (isRichCell(cell)) {
    if (cell.value !== undefined) return cell.value;
    if (cell.override) return `[${cell.override}]`;
    return '';
  }
  return cell;
}

function toRichCell(cell: Cell | undefined, patch: Partial<RichCell>): RichCell {
  if (isRichCell(cell as Cell)) {
    return { ...(cell as RichCell), ...patch };
  }
  return { value: cell as SimpleCell, ...patch };
}

function isFieldEditable(field: FieldDef): boolean {
  // increment auto fields (id) are locked; timestamp_version fields are now manually editable
  return field.type !== 'computed' && field.editable !== false && field.auto !== 'increment';
}

function versionComparator(a: unknown, b: unknown): number {
  const parse = (v: unknown) =>
    String(v ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const av = parse(a), bv = parse(b);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isVersionField(field: FieldDef): boolean {
  return field.auto === 'timestamp_version' || field.name === 'version';
}

function parseValue(raw: unknown, field: FieldDef): Cell | Cell[] {
  if (field.type === 'bool') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).toLowerCase();
    return s === 'true' || s === '1';
  }
  if (field.type === 'int') {
    if (typeof raw === 'number') return Math.round(raw);
    const n = parseInt(String(raw), 10);
    return isNaN(n) ? String(raw) : n;
  }
  if (field.type === 'float') {
    if (typeof raw === 'number') return raw;
    const n = parseFloat(String(raw));
    return isNaN(n) ? String(raw) : n;
  }
  if (field.type === 'list<int>') {
    if (Array.isArray(raw)) return raw as Cell[];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return raw.split(',').map((s) => {
        const n = parseInt(s.trim(), 10);
        return isNaN(n) ? 0 : n;
      });
    }
    return [];
  }
  if (field.type === 'list<string>') {
    if (Array.isArray(raw)) return raw as Cell[];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return raw.split(',').map((s) => s.trim());
    }
    return [];
  }
  return raw as Cell;
}

type SearchState = { show: boolean; mode: 'search' | 'replace' };

export function TableView({
  table, enums, cellColors, baseFields, validation, onSave, onAddRow, onDeleteRow,
  addColumnOpen, onAddColumnOpenChange,
}: Props) {
  const gridRef = useRef<AgGridReact>(null);
  const tableRecordsRef = useRef(table.records);
  tableRecordsRef.current = table.records;
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowIdx: number | null; fieldName: string | null } | null>(null);
  const [filterActive, setFilterActive] = useState(false);
  const [fieldEditTarget, setFieldEditTarget] = useState<string | null>(null);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);

  useEffect(() => {
    if (addColumnOpen) setShowAddColumnModal(true);
  }, [addColumnOpen]);

  const fields = useMemo(() => {
    return baseFields ? resolveFields(table.fields, baseFields) : table.fields;
  }, [table.fields, baseFields]);

  const rowData = useMemo(() => {
    return table.records.map((record, idx) => {
      const computed = computeRecord(record, fields);
      const row: { [k: string]: unknown } & { _idx: number; _errFields: Set<string>; _warnFields: Set<string> } = {
        _idx: idx,
        _errFields: new Set(
          validation?.errors.filter((e) => e.recordIndex === idx).map((e) => e.field) ?? []
        ),
        _warnFields: new Set(
          validation?.warnings.filter((w) => w.recordIndex === idx).map((w) => w.field) ?? []
        ),
      };
      for (const f of fields) {
        row[f.name] = getCellDisplayValue(computed[f.name] as Cell | undefined);
      }
      return row;
    });
  }, [table.records, fields, validation]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 60,
  }), []);

  const colDefs = useMemo<ColDef[]>(() => {
    return fields.map((f, i) => {
      const isEditable = isFieldEditable(f);

      let cellEditorSelector: ColDef['cellEditorSelector'];
      if (isEditable) {
        if (f.type === 'enum' && f.enum_ref && enums) {
          const values = enums.enums[f.enum_ref]?.values ?? [];
          cellEditorSelector = () => ({ component: 'agSelectCellEditor', params: { values } });
        } else if (f.type === 'bool') {
          cellEditorSelector = () => ({ component: 'agCheckboxCellEditor' });
        } else if (f.type === 'int' || f.type === 'float') {
          cellEditorSelector = () => ({ component: 'agNumberCellEditor' });
        } else {
          cellEditorSelector = () => ({ component: 'agTextCellEditor' });
        }
      }

      const CommentCellRenderer = (params: ICellRendererParams) => {
        const rowIdx = (params.data as { _idx: number })._idx;
        const raw = tableRecordsRef.current[rowIdx]?.[f.name];
        const hasComment = isRichCell(raw as Cell) && !!(raw as RichCell).comment;
        const hasFormula = f.type !== 'computed' && isRichCell(raw as Cell) && !!(raw as RichCell).override;
        const val = String(params.value ?? '');
        if (!hasComment && !hasFormula) return val;
        return (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {hasComment && (
              <div style={{
                position: 'absolute', top: 0, right: 0,
                width: 0, height: 0, borderStyle: 'solid',
                borderWidth: '0 7px 7px 0',
                borderColor: 'transparent #f57c00 transparent transparent',
              }} title={(raw as RichCell).comment ?? ''} />
            )}
            {hasFormula && (
              <div style={{
                position: 'absolute', bottom: 1, right: 2,
                fontSize: 9, color: '#1a73e8', fontWeight: 700, lineHeight: 1,
                pointerEvents: 'none', userSelect: 'none',
              }} title={`式: =${(raw as RichCell).override}`}>
                fx
              </div>
            )}
            {val}
          </div>
        );
      };

      return {
        field: f.name,
        headerName: f.display_name ?? f.name,
        editable: isEditable,
        flex: 1,
        minWidth: 60,
        cellEditorSelector,
        cellRenderer: CommentCellRenderer,
        headerClass: f.export === false ? 'col-no-export' : '',
        rowDrag: i === 0,
        checkboxSelection: i === 0,
        headerCheckboxSelection: i === 0,
        headerCheckboxSelectionFilteredOnly: i === 0,
        pinned: pinnedColumns.has(f.name) ? ('left' as const) : undefined,
        cellStyle: (params: { data: { _errFields: Set<string>; _warnFields: Set<string> } }) => {
          const hasError = params.data._errFields?.has(f.name);
          const hasWarn = params.data._warnFields?.has(f.name);
          if (hasError) return { border: '2px solid #e53935', background: '#fff8f8', color: 'inherit', fontStyle: 'normal' };
          if (hasWarn) return { border: '2px solid #fdd835', background: '#fffde7', color: 'inherit', fontStyle: 'normal' };
          if (f.type === 'computed') return { color: '#999', fontStyle: 'italic', border: '', background: '' };
          return { border: '', background: '', color: 'inherit', fontStyle: 'normal' };
        },
        ...(isVersionField(f) ? { comparator: versionComparator } : {}),
      };
    });
  }, [fields, enums, pinnedColumns]);

  const onCellValueChanged = useCallback((e: CellValueChangedEvent) => {
    const rowIdx = (e.data as { _idx: number })._idx;
    const fieldName = e.colDef.field;
    if (!fieldName) return;
    const field = fields.find((f) => f.name === fieldName);
    if (!field) return;

    const raw = e.newValue;
    const strVal = typeof raw === 'string' ? raw : '';

    const newRecords = table.records.map((r, i) => {
      if (i !== rowIdx) return r;
      const existing = r[fieldName] as Cell | undefined;

      const existingRich = existing !== undefined && isRichCell(existing as Cell);

      // '= → literal = (escape)
      if (typeof raw === 'string' && strVal.startsWith("'=")) {
        const literalVal = parseValue(strVal.slice(1), field);
        return existingRich
          ? { ...r, [fieldName]: { ...(existing as RichCell), value: literalVal as SimpleCell, override: undefined } }
          : { ...r, [fieldName]: literalVal };
      }

      // = prefix → store as formula override (clear value)
      if (typeof raw === 'string' && strVal.startsWith('=') && strVal.length > 1) {
        const formula = strVal.slice(1);
        return existingRich
          ? { ...r, [fieldName]: { ...(existing as RichCell), override: formula, value: undefined } }
          : { ...r, [fieldName]: { override: formula } };
      }

      // Normal value: clear any formula override
      const parsed = parseValue(raw, field);
      if (existing !== undefined && isRichCell(existing as Cell)) {
        return { ...r, [fieldName]: { ...(existing as RichCell), value: parsed as SimpleCell, override: undefined } };
      }
      return { ...r, [fieldName]: parsed };
    });
    onSave({ ...table, records: newRecords });
  }, [fields, table, onSave]);

  const onCellFocused = useCallback((e: CellFocusedEvent) => {
    if (e.rowIndex === null || e.rowIndex === undefined) return;
    const node = gridRef.current?.api?.getDisplayedRowAtIndex(e.rowIndex);
    if (!node?.data) return;
    const rowIdx = (node.data as { _idx: number })._idx;
    const colId = e.column instanceof Object ? (e.column as Column).getColId() : (e.column as string | null);
    setSelectedRow(rowIdx);
    setSelectedField(colId ?? null);
  }, []);

  const onCellClicked = useCallback((e: CellClickedEvent) => {
    const target = e.event?.target as HTMLInputElement | undefined;
    if (target?.type === 'checkbox') return;
    gridRef.current?.api?.deselectAll();
  }, []);

  const selectedFieldDef = useMemo(
    () => (selectedField ? fields.find((f) => f.name === selectedField) ?? null : null),
    [selectedField, fields]
  );

  const selectedCell = useMemo<Cell | null>(() => {
    if (selectedRow === null || !selectedField) return null;
    const record = table.records[selectedRow];
    if (!record) return null;
    const raw = record[selectedField];
    // 配列 (list<int> / list<string>) → 表示用文字列に変換
    if (Array.isArray(raw)) return (raw as (string | number)[]).join(', ') as Cell;
    // 未設定の場合
    if (raw === undefined) {
      // computed フィールドは算出値を表示
      if (selectedFieldDef?.type === 'computed') {
        const computed = computeRecord(record, fields);
        const val = computed[selectedField];
        if (val !== undefined && !Array.isArray(val)) return val as Cell;
      }
      return '';
    }
    return raw as Cell;
  }, [selectedRow, selectedField, selectedFieldDef, table.records, fields]);

  const handleCellUpdate = useCallback((newCell: Cell) => {
    if (selectedRow === null || !selectedField || !selectedFieldDef) return;
    if (!isFieldEditable(selectedFieldDef)) return;

    let valueToSave: Cell | Cell[] = newCell;
    if (selectedFieldDef.type === 'list<int>' || selectedFieldDef.type === 'list<string>') {
      // 詳細パネルでは "1, 3, 7" の文字列で編集されるので配列に戻す
      const strVal = isRichCell(newCell)
        ? String((newCell as RichCell).value ?? '')
        : String(newCell);
      valueToSave = parseValue(strVal, selectedFieldDef);
    }

    const newRecords = table.records.map((r, i) => {
      if (i !== selectedRow) return r;
      return { ...r, [selectedField]: valueToSave };
    });
    onSave({ ...table, records: newRecords });
  }, [selectedRow, selectedField, selectedFieldDef, table, onSave]);

  // Ctrl+V paste handler (multi-cell TSV)
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLInputElement;
    if ((el.tagName === 'INPUT' && el.type !== 'checkbox') || el.tagName === 'TEXTAREA') return;
    if (!gridRef.current?.api) return;
    if (gridRef.current.api.getEditingCells().length > 0) return;

    const focusedCell = gridRef.current.api.getFocusedCell();
    if (!focusedCell) return;

    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const pasteRows = text.split(/\r?\n/).filter((r) => r !== '');
    const startRow = focusedCell.rowIndex;
    const pasteColCount = pasteRows[0]?.split('\t').length ?? 0;
    // 全列分のTSV（行コピー）は列0から貼り付ける
    const startColIdx = pasteColCount === fields.length
      ? 0
      : fields.findIndex((f) => f.name === focusedCell.column.getColId());
    if (startColIdx === -1) return;

    const newRecords = [...table.records];
    pasteRows.forEach((rowText, rowOffset) => {
      const node = gridRef.current?.api?.getDisplayedRowAtIndex(startRow + rowOffset);
      if (!node?.data) return;
      const recordIdx = (node.data as { _idx: number })._idx;
      const values = rowText.split('\t');
      const record = { ...newRecords[recordIdx] };
      values.forEach((val, colOffset) => {
        const field = fields[startColIdx + colOffset];
        if (!field || !isFieldEditable(field)) return;
        const existing = record[field.name] as Cell | undefined;
        const existingRich = existing !== undefined && isRichCell(existing as Cell);
        if (val.startsWith("'=")) {
          const literalVal = parseValue(val.slice(1), field);
          record[field.name] = existingRich
            ? { ...(existing as RichCell), value: literalVal as SimpleCell, override: undefined }
            : literalVal;
        } else if (val.startsWith('=') && val.length > 1) {
          const formula = val.slice(1);
          record[field.name] = existingRich
            ? { ...(existing as RichCell), override: formula, value: undefined }
            : { override: formula };
        } else {
          const parsed = parseValue(val, field);
          record[field.name] = existingRich
            ? { ...(existing as RichCell), value: parsed as SimpleCell, override: undefined }
            : parsed;
        }
      });
      newRecords[recordIdx] = record;
    });

    onSave({ ...table, records: newRecords });
    e.preventDefault();
  }, [fields, table, onSave]);

  // Keyboard: Ctrl+C (multi-row copy), Ctrl+D (fill-down), Ctrl+F/H (search), Delete (row)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLInputElement;
    if ((el.tagName === 'INPUT' && el.type !== 'checkbox') || el.tagName === 'TEXTAREA') return;
    if (!gridRef.current?.api) return;
    const editing = gridRef.current.api.getEditingCells().length > 0;
    const mod = e.ctrlKey || e.metaKey;

    // Ctrl+F / Ctrl+H → search/replace panel
    if (mod && (e.key === 'f' || e.key === 'h') && !editing) {
      setSearchState({ show: true, mode: e.key === 'h' ? 'replace' : 'search' });
      e.preventDefault();
      return;
    }

    // Ctrl+C → copy
    if (mod && e.key === 'c' && !editing) {
      // フィルタ後の可視行のうち選択されているものだけコピー
      const selectedRows: Array<{ _idx: number } & Record<string, unknown>> = [];
      gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
        if (node.isSelected() && node.data) selectedRows.push(node.data as { _idx: number } & Record<string, unknown>);
      });
      if (selectedRows.length >= 1) {
        const tsv = selectedRows.map((row) =>
          fields.map((f) => String(row[f.name] ?? '')).join('\t')
        ).join('\n');
        navigator.clipboard.writeText(tsv).catch((err) => console.warn('clipboard write failed:', err));
        e.preventDefault();
        return;
      }
      // チェック選択なし → フォーカスセルの値のみコピー
      const fc = gridRef.current.api.getFocusedCell();
      if (!fc) return;
      const row = gridRef.current.api.getDisplayedRowAtIndex(fc.rowIndex);
      if (!row?.data) return;
      const val = (row.data as MasterRecord)[fc.column.getColId()];
      navigator.clipboard.writeText(String(val ?? '')).catch((err) => console.warn('clipboard write failed:', err));
      e.preventDefault();
    }

    // Ctrl+D → fill down: copy focused column value of first selected row to all other selected rows
    if (mod && e.key === 'd' && !editing) {
      const fc = gridRef.current.api.getFocusedCell();
      if (!fc) return;
      const fieldName = fc.column.getColId();
      const field = fields.find((f) => f.name === fieldName);
      if (!field || !isFieldEditable(field)) return;

      const selectedRows: Array<{ _idx: number } & Record<string, unknown>> = [];
      gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
        if (node.isSelected() && node.data) selectedRows.push(node.data as { _idx: number } & Record<string, unknown>);
      });
      if (selectedRows.length < 2) return;

      const firstIdx = selectedRows[0]._idx;
      const sourceCell = table.records[firstIdx]?.[fieldName] as Cell | undefined;
      const sourceValue: SimpleCell = (sourceCell !== undefined && isRichCell(sourceCell))
        ? (sourceCell as RichCell).value as SimpleCell
        : sourceCell as SimpleCell;

      const fillTargets = new Set(selectedRows.slice(1).map((row) => row._idx));
      const newRecords = table.records.map((r, i) => {
        if (!fillTargets.has(i)) return r;
        const existing = r[fieldName] as Cell | undefined;
        if (existing !== undefined && isRichCell(existing)) {
          return { ...r, [fieldName]: { ...(existing as RichCell), value: sourceValue } };
        }
        return { ...r, [fieldName]: sourceValue };
      });
      onSave({ ...table, records: newRecords });
      e.preventDefault();
    }

    // Delete → delete selected row
    if (e.key === 'Delete' && !editing) {
      if (selectedRow !== null) {
        onDeleteRow(selectedRow);
        setSelectedRow(null);
        setSelectedField(null);
        e.preventDefault();
      }
    }
  }, [selectedRow, onDeleteRow, fields, table, onSave]);

  const updateCellRich = useCallback((rowIdx: number, fieldName: string, patch: Partial<RichCell>) => {
    const newRecords = table.records.map((r, i) => {
      if (i !== rowIdx) return r;
      const cell = r[fieldName] as Cell | undefined;
      return { ...r, [fieldName]: toRichCell(cell, patch) };
    });
    onSave({ ...table, records: newRecords });
  }, [table, onSave]);

  // Right-click context menu
  const onCellContextMenu = useCallback((e: CellContextMenuEvent) => {
    (e.event as MouseEvent)?.preventDefault();
    const rowIdx = e.node ? (e.node.data as { _idx: number })._idx : null;
    const fieldName = e.column ? (e.column as Column).getColId() : null;
    const mouseEvent = e.event as MouseEvent;
    setContextMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY, rowIdx, fieldName });
  }, []);

  const buildContextMenuItems = useCallback((): MenuItem[] => {
    if (!contextMenu) return [];
    const { rowIdx, fieldName } = contextMenu;
    const field = fieldName ? fields.find((f) => f.name === fieldName) : null;
    const isPinned = fieldName ? pinnedColumns.has(fieldName) : false;
    const filterModel = gridRef.current?.api?.getFilterModel() ?? {};
    const hasColumnFilter = fieldName ? !!filterModel[fieldName] : false;

    const colorSubItems = cellColors
      ? Object.entries(cellColors.cell_colors).map(([key, def]) => ({
          label: `<span style="display:inline-block;width:12px;height:12px;background:${def.hex};border:1px solid #999;border-radius:2px;margin-right:6px;vertical-align:middle"></span>${def.label ?? key}`,
          html: true,
          action: () => {
            if (rowIdx !== null && fieldName) updateCellRich(rowIdx, fieldName, { color: key });
          },
        }))
      : [];

    const items: MenuItem[] = [
      ...(rowIdx !== null && fieldName
        ? [
            { type: 'submenu' as const, label: '色を設定', disabled: colorSubItems.length === 0, items: colorSubItems },
            {
              type: 'item' as const, label: 'コメントを編集',
              action: () => {
                const existing = table.records[rowIdx]?.[fieldName];
                const current = isRichCell(existing as Cell) ? (existing as RichCell).comment ?? '' : '';
                const result = window.prompt('コメントを入力してください:', current);
                if (result !== null) updateCellRich(rowIdx, fieldName, { comment: result || undefined });
              },
            },
          ]
        : []),
      ...(field?.type === 'computed' && rowIdx !== null && fieldName
        ? [{
            type: 'item' as const, label: '式をオーバーライド',
            action: () => {
              const existing = table.records[rowIdx]?.[fieldName];
              const current = isRichCell(existing as Cell) ? (existing as RichCell).override ?? '' : '';
              const result = window.prompt('オーバーライド式を入力（空白で解除）:', current);
              if (result !== null) updateCellRich(rowIdx, fieldName, { override: result || undefined });
            },
          }]
        : []),
      ...(fieldName
        ? [
            { type: 'separator' as const },
            {
              type: 'item' as const,
              label: isPinned ? 'この列の固定を解除' : 'この列を左に固定',
              action: () => {
                setPinnedColumns((prev) => {
                  const next = new Set(prev);
                  if (isPinned) next.delete(fieldName); else next.add(fieldName);
                  return next;
                });
              },
            },
          ]
        : []),
      ...(hasColumnFilter && fieldName
        ? [{
            type: 'item' as const,
            label: 'このフィルターをクリア',
            action: () => {
              const next = { ...filterModel };
              delete next[fieldName];
              gridRef.current?.api?.setFilterModel(next);
            },
          }]
        : []),
      ...(fieldName && table.fields.some((f) => f.name === fieldName)
        ? [
            { type: 'separator' as const },
            {
              type: 'item' as const,
              label: 'この列の設定を編集',
              action: () => setFieldEditTarget(fieldName),
            },
            {
              type: 'item' as const,
              label: 'この列を削除',
              action: () => {
                if (!window.confirm(`列「${field?.display_name ?? fieldName}」を削除しますか？\nこの操作は元に戻せません。`)) return;
                const newFields = table.fields.filter((f) => f.name !== fieldName);
                const newRecords = table.records.map((r) => {
                  const next = { ...r };
                  delete next[fieldName];
                  return next;
                });
                onSave({ ...table, fields: newFields, records: newRecords });
              },
            },
          ]
        : []),
      { type: 'separator' as const },
      { type: 'item', label: '行を追加', action: onAddRow },
      { type: 'item' as const, label: '列を追加', action: () => setShowAddColumnModal(true) },
      ...(rowIdx !== null
        ? [{ type: 'item' as const, label: '行を削除', action: () => { onDeleteRow(rowIdx); setSelectedRow(null); setSelectedField(null); } }]
        : []),
    ];
    return items;
  }, [contextMenu, fields, pinnedColumns, cellColors, onAddRow, onDeleteRow, table, onSave, updateCellRich]);

  // Row drag: sync new order back to records (preserve filtered-out rows at end)
  const onRowDragEnd = useCallback((_e: RowDragEndEvent) => {
    if (!gridRef.current?.api) return;
    const visibleIdxs: number[] = [];
    gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
      if (node.data) visibleIdxs.push((node.data as { _idx: number })._idx);
    });
    const visibleSet = new Set(visibleIdxs);
    const hiddenRecords = table.records.filter((_, i) => !visibleSet.has(i));
    const newRecords = [
      ...visibleIdxs.map((idx) => table.records[idx]),
      ...hiddenRecords,
    ];
    onSave({ ...table, records: newRecords });
  }, [table, onSave]);

  // Search panel: navigate to match cell (use display index, not record index)
  const handleSearchNavigate = useCallback((rowIdx: number, fieldName: string) => {
    if (!gridRef.current?.api) return;
    let displayIndex: number | null = null;
    gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
      if ((node.data as { _idx: number })?._idx === rowIdx) {
        displayIndex = node.rowIndex ?? null;
      }
    });
    if (displayIndex === null) return;
    gridRef.current.api.ensureIndexVisible(displayIndex);
    gridRef.current.api.setFocusedCell(displayIndex, fieldName);
  }, []);

  // Search panel: replace matches
  const handleSearchReplace = useCallback(
    (matches: Array<{ rowIdx: number; fieldName: string }>, newValue: string) => {
      if (matches.length === 0) return;
      const newRecords = [...table.records];
      for (const { rowIdx, fieldName } of matches) {
        const field = fields.find((f) => f.name === fieldName);
        if (!field || !isFieldEditable(field)) continue;
        const existing = newRecords[rowIdx][fieldName] as Cell;
        const parsed = parseValue(newValue, field);
        if (isRichCell(existing)) {
          newRecords[rowIdx] = { ...newRecords[rowIdx], [fieldName]: { ...(existing as RichCell), value: parsed as SimpleCell } };
        } else {
          newRecords[rowIdx] = { ...newRecords[rowIdx], [fieldName]: parsed };
        }
      }
      onSave({ ...table, records: newRecords });
    },
    [table, fields, onSave]
  );

  // validation 変化時に cellStyle を強制再評価（_errFields はrow dataに含まれるが cellStyle は値変化がないと再呼されない）
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ force: true });
  }, [validation]);

  // Table-level validation errors (recordIndex === -1)
  const tableErrors = validation?.errors.filter((e) => e.recordIndex === -1) ?? [];
  const recordErrors = validation?.errors.filter((e) => e.recordIndex >= 0) ?? [];

  return (
    <div style={styles.container}>
      <div
        className="ag-theme-alpine"
        style={{ ...styles.grid, position: 'relative' }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      >
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          getRowId={(params) => String((params.data as { _idx: number })._idx)}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          onCellValueChanged={onCellValueChanged}
          onCellFocused={onCellFocused}
          onCellClicked={onCellClicked}
          rowSelection="multiple"
          suppressRowClickSelection
          rowDragManaged
          onRowDragEnd={onRowDragEnd}
          animateRows
          stopEditingWhenCellsLoseFocus
          suppressContextMenu
          onCellContextMenu={onCellContextMenu}
          onFilterChanged={() => {
            const model = gridRef.current?.api?.getFilterModel();
            setFilterActive(!!model && Object.keys(model).length > 0);
          }}
        />
        {filterActive && (
          <button
            style={styles.clearFilterBtn}
            onClick={() => { gridRef.current?.api?.setFilterModel(null); }}
          >
            フィルタークリア ✕
          </button>
        )}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={buildContextMenuItems()}
            onClose={() => setContextMenu(null)}
          />
        )}
        {searchState?.show && (
          <SearchPanel
            mode={searchState.mode}
            fields={fields}
            records={table.records}
            onClose={() => setSearchState(null)}
            onNavigate={handleSearchNavigate}
            onReplace={handleSearchReplace}
          />
        )}
      </div>
      {fieldEditTarget && (() => {
        const targetField = table.fields.find((f) => f.name === fieldEditTarget);
        if (!targetField) return null;
        return (
          <FieldEditModal
            field={targetField}
            onSave={(updated) => {
              const newFields = table.fields.map((f) => f.name === updated.name ? updated : f);
              onSave({ ...table, fields: newFields });
            }}
            onClose={() => setFieldEditTarget(null)}
          />
        );
      })()}
      {showAddColumnModal && (
        <AddColumnModal
          existingNames={new Set(fields.map((f) => f.name))}
          onAdd={(newField) => {
            onSave({ ...table, fields: [...table.fields, newField] });
          }}
          onClose={() => {
            setShowAddColumnModal(false);
            onAddColumnOpenChange?.(false);
          }}
        />
      )}
      <CellDetailPanel
        fieldName={selectedField}
        cell={selectedCell}
        cellColors={cellColors}
        onUpdate={handleCellUpdate}
        readonly={!selectedFieldDef || !isFieldEditable(selectedFieldDef)}
      />
      {validation && (tableErrors.length > 0 || recordErrors.length > 0 || validation.warnings.length > 0) && (
        <div style={styles.messagePanel}>
          {tableErrors.map((err, i) => (
            <div key={`te${i}`} style={styles.errorItem}>
              ✕ [テーブル] {err.field}: {err.message}
            </div>
          ))}
          {recordErrors.map((err, i) => (
            <div key={`e${i}`} style={styles.errorItem}>
              ✕ 行{err.recordIndex + 1} / {err.field}: {err.message}
            </div>
          ))}
          {validation.warnings.map((w, i) => (
            <div key={`w${i}`} style={styles.warnItem}>
              ⚠ 行{w.recordIndex + 1} / {w.field}: {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', outline: 'none' },
  grid: { flex: 1, overflow: 'hidden' },
  clearFilterBtn: {
    position: 'absolute', top: 8, right: 12, zIndex: 10,
    padding: '3px 10px', fontSize: 12, cursor: 'pointer',
    background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 4, color: '#e65100',
  },
  messagePanel: {
    maxHeight: 120,
    overflowY: 'auto',
    borderTop: '1px solid #ddd',
    padding: '4px 12px',
    background: '#fafafa',
    fontSize: 12,
  },
  errorItem: { color: '#c62828', padding: '2px 0' },
  warnItem: { color: '#f57f17', padding: '2px 0' },
};
