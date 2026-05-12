import { useMemo, useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
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
  ColumnMovedEvent,
  ColumnResizedEvent,
  ICellRendererParams,
  IHeaderParams,
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
  return field.editable !== false && field.auto !== 'increment';
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

// セル編集時、その行の _formulas にこの列の式があれば「=式」を初期値とするテキストエディタ
type FormulaAwareEditorProps = {
  value?: unknown;
  data?: { _formulas?: { [k: string]: string } };
  colDef?: { field?: string };
  eventKey?: string | null;
  charPress?: string | null;
  stopEditing?: () => void;
};

const FormulaAwareTextEditor = forwardRef((props: FormulaAwareEditorProps, ref) => {
  const fieldName = props.colDef?.field;
  const formula = fieldName ? props.data?._formulas?.[fieldName] : undefined;
  const initialValue = formula !== undefined
    ? `=${formula}`
    // BACKSPACE/DELETE で編集開始時はクリア、文字キー開始時はその文字、それ以外は既存値
    : props.eventKey === 'Backspace' || props.eventKey === 'Delete'
      ? ''
      : props.charPress != null
        ? props.charPress
        : String(props.value ?? '');
  const [val, setVal] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    getValue: () => val,
    isCancelBeforeStart: () => false,
    isCancelAfterEnd: () => false,
  }));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') props.stopEditing?.();
      }}
      style={{ width: '100%', height: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', padding: '0 8px' }}
    />
  );
});
FormulaAwareTextEditor.displayName = 'FormulaAwareTextEditor';

type ColumnHeaderParams = IHeaderParams & {
  isTableField: boolean;
  fieldName: string;
  onSettings?: () => void;
  onDelete?: () => void;
  onAddColumn: () => void;
  hasHeaderCheckbox: boolean;
};

function ColumnHeader(params: ColumnHeaderParams) {
  const { displayName, column, enableSorting, progressSort, api,
    isTableField, fieldName, onSettings, onDelete, onAddColumn, hasHeaderCheckbox } = params;

  const [sort, setSort] = useState<'asc' | 'desc' | null>(column.getSort() ?? null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [allSelected, setAllSelected] = useState(false);
  const [someSelected, setSomeSelected] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onSort = () => setSort(column.getSort() ?? null);
    column.addEventListener('sortChanged', onSort);
    return () => column.removeEventListener('sortChanged', onSort);
  }, [column]);

  useEffect(() => {
    if (!hasHeaderCheckbox) return;
    const update = () => {
      let total = 0, sel = 0;
      api.forEachNodeAfterFilter((n) => { total++; if (n.isSelected()) sel++; });
      setAllSelected(total > 0 && sel === total);
      setSomeSelected(sel > 0 && sel < total);
    };
    api.addEventListener('selectionChanged', update);
    api.addEventListener('filterChanged', update);
    return () => {
      api.removeEventListener('selectionChanged', update);
      api.removeEventListener('filterChanged', update);
    };
  }, [api, hasHeaderCheckbox]);

  useEffect(() => {
    if (!menuPos) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuPos(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuPos]);

  const sortIcon = sort === 'asc' ? ' ▲' : sort === 'desc' ? ' ▼' : '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', gap: 2 }}>
      {hasHeaderCheckbox && (
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected; }}
          onChange={() => allSelected ? api.deselectAll() : api.selectAllFiltered()}
          style={{ margin: '0 2px 0 0', flexShrink: 0, cursor: 'pointer' }}
        />
      )}
      <span
        onClick={(e) => { if (enableSorting) progressSort(e.shiftKey); }}
        style={{ flex: 1, cursor: enableSorting ? 'pointer' : 'default', overflow: 'hidden', userSelect: 'none' }}
      >
        <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{displayName}{sortIcon}</div>
        <div style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{fieldName}</div>
      </span>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (menuPos) { setMenuPos(null); return; }
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuPos({ top: rect.bottom, left: rect.left });
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px', fontSize: 15, color: '#888', lineHeight: 1 }}
          title="列メニュー"
        >
          ⋮
        </button>
        {menuPos && (
          <div
            ref={menuRef}
            style={{
              position: 'fixed', top: menuPos.top, left: menuPos.left,
              background: '#fff', border: '1px solid #ddd', borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 9999, minWidth: 160, fontSize: 13,
            }}
          >
            {isTableField && onSettings && (
              <div onClick={() => { setMenuPos(null); onSettings(); }} style={colMenuItemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                この列の設定を編集
              </div>
            )}
            {isTableField && onDelete && (
              <div onClick={() => { setMenuPos(null); onDelete(); }} style={{ ...colMenuItemStyle, color: '#c62828' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                この列を削除
              </div>
            )}
            <div onClick={() => { setMenuPos(null); onAddColumn(); }} style={colMenuItemStyle}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              列を追加
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const colMenuItemStyle: React.CSSProperties = { padding: '6px 12px', cursor: 'pointer' };

function parseValue(raw: unknown, field: FieldDef): Cell | Cell[] | undefined {
  if (field.type === 'bool') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).toLowerCase();
    return s === 'true' || s === '1';
  }
  if (field.type === 'int') {
    if (typeof raw === 'number') return Math.round(raw);
    const s = String(raw).trim();
    if (s === '') return undefined;
    const n = parseInt(s, 10);
    // 入力が数値として解釈できない場合は undefined を返し呼び出し側で破棄させる
    return isNaN(n) || !/^-?\d+$/.test(s) ? undefined : n;
  }
  if (field.type === 'float') {
    if (typeof raw === 'number') return raw;
    const s = String(raw).trim();
    if (s === '') return undefined;
    const n = parseFloat(s);
    return isNaN(n) || !/^-?\d*\.?\d+$/.test(s) ? undefined : n;
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

function applyFormulaInput(
  val: string,
  field: FieldDef,
  existing: Cell | undefined
): Cell | Cell[] | RichCell | undefined {
  const existingRich = existing !== undefined && isRichCell(existing as Cell);
  if (val.startsWith("'=")) {
    const literalVal = parseValue(val.slice(1), field);
    if (literalVal === undefined) return existing; // 型に合わない値は破棄
    return existingRich
      ? { ...(existing as RichCell), value: literalVal as SimpleCell, override: undefined }
      : literalVal as Cell | Cell[];
  }
  if (val.startsWith('=') && val.length > 1) {
    const formula = val.slice(1);
    return existingRich
      ? { ...(existing as RichCell), override: formula, value: undefined }
      : { override: formula };
  }
  const parsed = parseValue(val, field);
  if (parsed === undefined) return existing; // 型に合わない値は破棄
  return existingRich
    ? { ...(existing as RichCell), value: parsed as SimpleCell, override: undefined }
    : parsed as Cell | Cell[];
}

type SearchState = { show: boolean; mode: 'search' | 'replace' };

// 範囲選択（表示インデックス + 列インデックス）。anchor = ドラッグ/Shift+クリックの起点
type CellRange = { anchorRow: number; anchorCol: number; focusRow: number; focusCol: number };

function normalizeRange(r: CellRange): { r0: number; r1: number; c0: number; c1: number } {
  return {
    r0: Math.min(r.anchorRow, r.focusRow),
    r1: Math.max(r.anchorRow, r.focusRow),
    c0: Math.min(r.anchorCol, r.focusCol),
    c1: Math.max(r.anchorCol, r.focusCol),
  };
}

function cellPosFromTarget(target: EventTarget | null, fields: FieldDef[]): { row: number; col: number } | null {
  if (!(target instanceof Element)) return null;
  const cellEl = target.closest('.ag-cell');
  if (!cellEl) return null;
  const colId = cellEl.getAttribute('col-id');
  if (!colId) return null;
  const rowEl = cellEl.closest('.ag-row');
  if (!rowEl) return null;
  const rowIdxStr = rowEl.getAttribute('row-index');
  if (!rowIdxStr) return null;
  const row = parseInt(rowIdxStr, 10);
  const col = fields.findIndex((f) => f.name === colId);
  if (col === -1 || isNaN(row)) return null;
  return { row, col };
}

export function TableView({
  table, enums, cellColors, baseFields, validation, onSave, onAddRow, onDeleteRow,
  addColumnOpen, onAddColumnOpenChange,
}: Props) {
  const gridRef = useRef<AgGridReact>(null);
  const tableRecordsRef = useRef(table.records);
  tableRecordsRef.current = table.records;
  const tableRef = useRef(table);
  tableRef.current = table;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowIdx: number | null; fieldName: string | null } | null>(null);
  const [filterActive, setFilterActive] = useState(false);
  const [fieldEditTarget, setFieldEditTarget] = useState<string | null>(null);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [cellRange, setCellRange] = useState<CellRange | null>(null);
  // ドラッグ中の範囲（mousemove は ref を介して setCellRange へ反映）
  const dragRangeRef = useRef<CellRange | null>(null);
  const isDraggingRef = useRef(false);
  const cellRangeRef = useRef<CellRange | null>(null);
  cellRangeRef.current = cellRange;
  // capture-phase keydown ハンドラで参照する最新値
  const selectedRowRef = useRef(selectedRow);
  selectedRowRef.current = selectedRow;
  const onDeleteRowRef = useRef(onDeleteRow);
  onDeleteRowRef.current = onDeleteRow;
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const fieldEditTargetDef = useMemo(
    () => fieldEditTarget ? (table.fields.find((f) => f.name === fieldEditTarget) ?? null) : null,
    [fieldEditTarget, table.fields]
  );

  useEffect(() => {
    if (addColumnOpen) setShowAddColumnModal(true);
  }, [addColumnOpen]);

  // テーブル切替・列構造変化時は cellRange の表示インデックス/列インデックスが無効になるため解除
  useEffect(() => {
    setCellRange(null);
  }, [table.table, table.fields.length]);

  const fields = useMemo(() => {
    return baseFields ? resolveFields(table.fields, baseFields) : table.fields;
  }, [table.fields, baseFields]);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const rowData = useMemo(() => {
    return table.records.map((record, idx) => {
      const computed = computeRecord(record, fields);
      const formulas: { [k: string]: string } = {};
      for (const f of fields) {
        const raw = record[f.name];
        if (isRichCell(raw as Cell) && (raw as RichCell).override) {
          formulas[f.name] = (raw as RichCell).override as string;
        }
      }
      const row: { [k: string]: unknown } & {
        _idx: number; _errFields: Set<string>; _warnFields: Set<string>;
        _formulas: { [k: string]: string };
      } = {
        _idx: idx,
        _errFields: new Set(
          validation?.errors.filter((e) => e.recordIndex === idx).map((e) => e.field) ?? []
        ),
        _warnFields: new Set(
          validation?.warnings.filter((w) => w.recordIndex === idx).map((w) => w.field) ?? []
        ),
        _formulas: formulas,
      };
      for (const f of fields) {
        row[f.name] = getCellDisplayValue(computed[f.name] as Cell | undefined);
      }
      return row;
    });
  }, [table.records, fields, validation]);

  // 範囲を「列名 → 表示行インデックス集合」に展開（cellStyle から O(1) で参照）
  const rangeFieldRows = useMemo(() => {
    if (!cellRange) return null;
    const { r0, r1, c0, c1 } = normalizeRange(cellRange);
    const rowSet = new Set<number>();
    for (let r = r0; r <= r1; r++) rowSet.add(r);
    const fieldNames = new Set<string>();
    for (let c = c0; c <= c1; c++) {
      const f = fields[c];
      if (f) fieldNames.add(f.name);
    }
    return { fieldNames, rowSet };
  }, [cellRange, fields]);
  const rangeFieldRowsRef = useRef(rangeFieldRows);
  rangeFieldRowsRef.current = rangeFieldRows;

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 60,
    // 自動型変換を無効化（= 式入力や semver 文字列を NaN にしないため）
    cellDataType: false,
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
        } else {
          // int/float/string/list は FormulaAwareTextEditor を使い、既存の = 式を編集可能にする
          cellEditorSelector = () => ({ component: FormulaAwareTextEditor });
        }
      }

      const CommentCellRenderer = (params: ICellRendererParams) => {
        const rowIdx = (params.data as { _idx: number })._idx;
        const raw = tableRecordsRef.current[rowIdx]?.[f.name];
        const hasComment = isRichCell(raw as Cell) && !!(raw as RichCell).comment;
        const hasFormula = isRichCell(raw as Cell) && !!(raw as RichCell).override;
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

      const isTableField = table.fields.some((tf) => tf.name === f.name);
      const fieldName = f.name;

      const savedWidth = table.column_widths?.[f.name];
      return {
        field: f.name,
        headerName: f.display_name ?? f.name,
        editable: isEditable,
        suppressMovable: !isTableField,
        // 保存幅 > デフォルト 150px（合計が画面幅を超えたら横スクロール）
        width: typeof savedWidth === 'number' ? savedWidth : 150,
        minWidth: 60,
        cellEditorSelector,
        cellRenderer: CommentCellRenderer,
        headerClass: f.export === false ? 'col-no-export' : '',
        rowDrag: i === 0,
        checkboxSelection: i === 0,
        pinned: pinnedColumns.has(f.name) ? ('left' as const) : undefined,
        headerComponent: ColumnHeader,
        headerComponentParams: {
          isTableField,
          fieldName,
          hasHeaderCheckbox: i === 0,
          onSettings: isTableField ? () => setFieldEditTarget(fieldName) : undefined,
          onDelete: isTableField ? () => {
            const t = tableRef.current;
            const field = t.fields.find((f) => f.name === fieldName);
            if (!window.confirm(`列「${field?.display_name ?? fieldName}」を削除しますか？`)) return;
            const newFields = t.fields.filter((f) => f.name !== fieldName);
            const newRecords = t.records.map((r) => { const next = { ...r }; delete next[fieldName]; return next; });
            onSaveRef.current({ ...t, fields: newFields, records: newRecords });
          } : undefined,
          onAddColumn: () => setShowAddColumnModal(true),
        },
        cellStyle: (params: {
          data: { _errFields: Set<string>; _warnFields: Set<string>; _idx: number };
          node: { rowIndex: number | null };
        }) => {
          const hasError = params.data._errFields?.has(f.name);
          const hasWarn = params.data._warnFields?.has(f.name);
          const range = rangeFieldRowsRef.current;
          const displayIdx = params.node.rowIndex;
          const inRange = !!(range && displayIdx !== null
            && range.fieldNames.has(f.name) && range.rowSet.has(displayIdx));
          if (hasError) {
            return inRange
              ? { border: '2px solid #e53935', background: '#ffe4e4', color: 'inherit', fontStyle: 'normal' }
              : { border: '2px solid #e53935', background: '#fff8f8', color: 'inherit', fontStyle: 'normal' };
          }
          if (hasWarn) {
            return inRange
              ? { border: '2px solid #fdd835', background: '#fff59d', color: 'inherit', fontStyle: 'normal' }
              : { border: '2px solid #fdd835', background: '#fffde7', color: 'inherit', fontStyle: 'normal' };
          }
          const raw = tableRecordsRef.current[params.data._idx]?.[f.name];
          const colorKey = isRichCell(raw as Cell) ? (raw as RichCell).color : undefined;
          const colorHex = colorKey && cellColors ? (cellColors.cell_colors[colorKey]?.hex ?? '') : '';
          const rangeBg = inRange ? 'rgba(25, 118, 210, 0.18)' : '';
          // 編集不可フィールドはグレー斜体
          if (!isFieldEditable(f)) return { color: '#999', fontStyle: 'italic', border: '', background: rangeBg || colorHex || (f.export === false ? '#f0f0f0' : '') };
          if (f.export === false) return { border: '', background: rangeBg || colorHex || '#f0f0f0', color: 'inherit', fontStyle: 'normal' };
          return { border: '', background: rangeBg || colorHex, color: 'inherit', fontStyle: 'normal' };
        },
        ...(isVersionField(f) ? { comparator: versionComparator } : {}),
      };
    });
  }, [fields, enums, pinnedColumns, table.fields, table.column_widths, cellColors, setFieldEditTarget]);

  const onCellValueChanged = useCallback((e: CellValueChangedEvent) => {
    const rowIdx = (e.data as { _idx: number })._idx;
    const fieldName = e.colDef.field;
    if (!fieldName) return;
    const field = fields.find((f) => f.name === fieldName);
    if (!field) return;

    const newRecords = table.records.map((r, i) => {
      if (i !== rowIdx) return r;
      const existing = r[fieldName] as Cell | undefined;
      // 文字列入力は = 式判定込みで処理（int/float/string/list はすべて agTextCellEditor）
      if (typeof e.newValue === 'string') {
        const next = applyFormulaInput(e.newValue, field, existing);
        return next === existing ? r : { ...r, [fieldName]: next };
      }
      // bool checkbox エディタは boolean を返すため直接 parseValue
      const parsed = parseValue(e.newValue, field);
      if (parsed === undefined) return r; // 型に合わない値は破棄
      const existingRich = existing !== undefined && isRichCell(existing as Cell);
      return {
        ...r,
        [fieldName]: existingRich
          ? { ...(existing as RichCell), value: parsed as SimpleCell, override: undefined }
          : parsed,
      };
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

  // セル mousedown: 通常クリックなら範囲リセット＋ドラッグ起点記録、Shift+クリックなら anchor から focus を更新
  const handleGridMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (!(target instanceof Element)) return;
    // ヘッダー・行ドラッグハンドル・チェックボックス上は無視
    if (target.closest('.ag-header')) return;
    if (target.closest('.ag-row-drag')) return;
    if ((target as HTMLInputElement).tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') return;
    // 編集中（input/textarea）は無視
    if (target.closest('.ag-cell-inline-editing')) return;

    const pos = cellPosFromTarget(target, fields);
    if (!pos) return;

    if (e.shiftKey) {
      // 既存 range があれば anchor を維持、無ければフォーカスセルを anchor とする
      const existing = cellRangeRef.current;
      let anchorRow = pos.row, anchorCol = pos.col;
      if (existing) {
        anchorRow = existing.anchorRow;
        anchorCol = existing.anchorCol;
      } else {
        const fc = gridRef.current?.api?.getFocusedCell();
        if (fc) {
          const colIdx = fields.findIndex((f) => f.name === fc.column.getColId());
          if (colIdx !== -1) {
            anchorRow = fc.rowIndex;
            anchorCol = colIdx;
          }
        }
      }
      if (anchorRow === pos.row && anchorCol === pos.col) {
        setCellRange(null);
      } else {
        setCellRange({ anchorRow, anchorCol, focusRow: pos.row, focusCol: pos.col });
      }
      return;
    }

    // 通常クリック: 範囲を一旦解除し、ドラッグ起点を記録
    setCellRange(null);
    isDraggingRef.current = true;
    dragRangeRef.current = { anchorRow: pos.row, anchorCol: pos.col, focusRow: pos.row, focusCol: pos.col };

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !dragRangeRef.current) return;
      const p = cellPosFromTarget(ev.target as Element, fields);
      if (!p) return;
      const r = dragRangeRef.current;
      if (r.focusRow === p.row && r.focusCol === p.col) return;
      const next = { ...r, focusRow: p.row, focusCol: p.col };
      dragRangeRef.current = next;
      if (next.anchorRow !== next.focusRow || next.anchorCol !== next.focusCol) {
        setCellRange(next);
      } else {
        // 元のセルに戻った場合は range をクリア
        setCellRange(null);
      }
    };
    const onUp = () => {
      isDraggingRef.current = false;
      dragRangeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [fields]);

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
      // 列に formula があれば算出値を表示
      if (selectedFieldDef?.formula) {
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
      const parsed = parseValue(strVal, selectedFieldDef);
      if (parsed === undefined) return; // 型不一致なら更新しない
      valueToSave = parsed;
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
    const api = gridRef.current?.api;
    if (!api) return;
    if (api.getEditingCells().length > 0) return;

    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const pasteRows = text.split(/\r?\n/).filter((r) => r !== '');
    const pasteColCount = pasteRows[0]?.split('\t').length ?? 0;

    // ペースト起点と範囲を決定
    // - 範囲選択あり: 左上を起点、範囲サイズが 1x1 の貼付データなら範囲全体にフィル
    // - 範囲なし: フォーカスセル起点（全列分の TSV なら列 0 起点）
    let startRow: number;
    let startColIdx: number;
    let fillTo: { r1: number; c1: number } | null = null;
    if (cellRange) {
      const { r0, r1, c0, c1 } = normalizeRange(cellRange);
      startRow = r0;
      startColIdx = c0;
      if (pasteRows.length === 1 && pasteColCount === 1) {
        fillTo = { r1, c1 };
      }
    } else {
      const focusedCell = api.getFocusedCell();
      if (!focusedCell) return;
      startRow = focusedCell.rowIndex;
      // 全列分のTSV（行コピー）は列0から貼り付ける
      startColIdx = pasteColCount === fields.length
        ? 0
        : fields.findIndex((f) => f.name === focusedCell.column.getColId());
      if (startColIdx === -1) return;
    }

    const newRecords = [...table.records];

    if (fillTo) {
      // 1x1 を範囲全体にフィル
      const val = pasteRows[0].split('\t')[0] ?? '';
      for (let r = startRow; r <= fillTo.r1; r++) {
        const node = api.getDisplayedRowAtIndex(r);
        if (!node?.data) continue;
        const recordIdx = (node.data as { _idx: number })._idx;
        const record = { ...newRecords[recordIdx] };
        for (let c = startColIdx; c <= fillTo.c1; c++) {
          const field = fields[c];
          if (!field || !isFieldEditable(field)) continue;
          const existing = record[field.name] as Cell | undefined;
          const next = applyFormulaInput(val, field, existing);
          if (next === undefined) continue;
          record[field.name] = next;
        }
        newRecords[recordIdx] = record;
      }
    } else {
      pasteRows.forEach((rowText, rowOffset) => {
        const node = api.getDisplayedRowAtIndex(startRow + rowOffset);
        if (!node?.data) return;
        const recordIdx = (node.data as { _idx: number })._idx;
        const values = rowText.split('\t');
        const record = { ...newRecords[recordIdx] };
        values.forEach((val, colOffset) => {
          const field = fields[startColIdx + colOffset];
          if (!field || !isFieldEditable(field)) return;
          const existing = record[field.name] as Cell | undefined;
          const next = applyFormulaInput(val, field, existing);
          if (next === undefined) return; // 型不一致のセルはスキップ
          record[field.name] = next;
        });
        newRecords[recordIdx] = record;
      });
    }

    onSave({ ...table, records: newRecords });
    e.preventDefault();
  }, [fields, table, onSave, cellRange]);

  // Keyboard: Ctrl+C (copy), Ctrl+D (fill-down), Ctrl+F/H (search)
  // Delete/Backspace は capture-phase の useEffect で処理（AG Grid のデフォルトを奪うため）
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

    // Ctrl+C → copy（優先: 範囲 > 行選択 > 単セル）
    if (mod && e.key === 'c' && !editing) {
      // 1) 矩形範囲があれば矩形 TSV
      if (cellRange) {
        const { r0, r1, c0, c1 } = normalizeRange(cellRange);
        const lines: string[] = [];
        for (let r = r0; r <= r1; r++) {
          const node = gridRef.current.api.getDisplayedRowAtIndex(r);
          if (!node?.data) continue;
          const cols: string[] = [];
          for (let c = c0; c <= c1; c++) {
            const field = fields[c];
            if (!field) { cols.push(''); continue; }
            cols.push(String((node.data as MasterRecord)[field.name] ?? ''));
          }
          lines.push(cols.join('\t'));
        }
        navigator.clipboard.writeText(lines.join('\n')).catch((err) => console.warn('clipboard write failed:', err));
        e.preventDefault();
        return;
      }
      // 2) フィルタ後の可視行のうち選択されているものだけコピー
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
      // 3) チェック選択なし → フォーカスセルの値のみコピー
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
  }, [fields, table, onSave, cellRange]);

  const updateCellRich = useCallback((rowIdx: number, fieldName: string, patch: Partial<RichCell>) => {
    const newRecords = table.records.map((r, i) => {
      if (i !== rowIdx) return r;
      const cell = r[fieldName] as Cell | undefined;
      return { ...r, [fieldName]: toRichCell(cell, patch) };
    });
    onSave({ ...table, records: newRecords });
  }, [table, onSave]);

  // Right-click context menu (cell)
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
      ...(field && isFieldEditable(field) && rowIdx !== null && fieldName
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
                if (!window.confirm(`列「${field?.display_name ?? fieldName}」を削除しますか？`)) return;
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
        ? [{
            type: 'item' as const,
            label: '行を削除',
            action: () => {
              if (!window.confirm('この行を削除しますか？')) return;
              onDeleteRow(rowIdx);
              setSelectedRow(null);
              setSelectedField(null);
            },
          }]
        : []),
    ];
    return items;
  }, [contextMenu, fields, pinnedColumns, cellColors, onAddRow, onDeleteRow, table, onSave, updateCellRich]);

  // 列移動: AG Grid の表示順を table.fields の順序に反映（base_fields は移動不可なので無視）
  const onColumnMoved = useCallback((e: ColumnMovedEvent) => {
    if (!e.finished) return;
    if (e.source !== 'uiColumnMoved' && e.source !== 'uiColumnDragged') return; // プログラム経由は無視
    const api = gridRef.current?.api;
    if (!api) return;
    const orderedNames = api.getAllGridColumns().map((c) => c.getColId());
    const tableFieldNames = new Set(tableRef.current.fields.map((f) => f.name));
    const newOrder = orderedNames.filter((n) => tableFieldNames.has(n));
    const fieldMap = new Map(tableRef.current.fields.map((f) => [f.name, f]));
    const reordered = newOrder.map((n) => fieldMap.get(n)!).filter(Boolean);
    // 順序が変わっていなければ保存しない
    const same = reordered.length === tableRef.current.fields.length
      && reordered.every((f, i) => f.name === tableRef.current.fields[i].name);
    if (same) return;
    onSaveRef.current({ ...tableRef.current, fields: reordered });
  }, []);

  // 列リサイズ: 確定時のみ table.column_widths に保存（base_fields も table.fields も統一管理）
  const onColumnResized = useCallback((e: ColumnResizedEvent) => {
    if (!e.finished || !e.column) return;
    if (e.source !== 'uiColumnResized' && e.source !== 'uiColumnDragged') return; // flex/auto/api 経由は無視

    const fieldName = e.column.getColId();
    const width = e.column.getActualWidth();
    const t = tableRef.current;
    if (t.column_widths?.[fieldName] === width) return;
    const newWidths = { ...(t.column_widths ?? {}), [fieldName]: width };
    onSaveRef.current({ ...t, column_widths: newWidths });
  }, []);

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
        if (parsed === undefined) continue; // 型不一致はスキップ
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

  // Delete / Backspace をキャプチャフェーズで奪う
  // AG Grid のセルレベル keydown が先に走ると、デフォルト動作（編集モードを空入力で開始）でフォーカスセルだけクリアされてしまうため、
  // grid root にキャプチャフェーズの native listener を付けて先回りする。
  // Mac の「delete」キーは Backspace を送出するため両方を扱う。
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement;
      if ((target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox') || target.tagName === 'TEXTAREA') return;
      const api = gridRef.current?.api;
      if (!api) return;
      if (api.getEditingCells().length > 0) return;

      const range = cellRangeRef.current;
      if (range) {
        e.preventDefault();
        e.stopPropagation();
        const { r0, r1, c0, c1 } = normalizeRange(range);
        const currentTable = tableRef.current;
        const currentFields = fieldsRef.current;
        const targetRecordIdxs: number[] = [];
        for (let r = r0; r <= r1; r++) {
          const node = api.getDisplayedRowAtIndex(r);
          if (!node?.data) continue;
          targetRecordIdxs.push((node.data as { _idx: number })._idx);
        }
        const targetSet = new Set(targetRecordIdxs);
        const targetFields: FieldDef[] = [];
        for (let c = c0; c <= c1; c++) {
          const f = currentFields[c];
          if (f && isFieldEditable(f)) targetFields.push(f);
        }
        if (targetFields.length === 0) return;
        const newRecords = currentTable.records.map((r, i) => {
          if (!targetSet.has(i)) return r;
          const next = { ...r };
          for (const f of targetFields) {
            const existing = next[f.name] as Cell | undefined;
            if (existing === undefined) continue;
            if (isRichCell(existing as Cell)) {
              const rich = existing as RichCell;
              if (rich.color !== undefined || rich.comment !== undefined) {
                next[f.name] = { color: rich.color, comment: rich.comment };
              } else {
                delete next[f.name];
              }
            } else {
              delete next[f.name];
            }
          }
          return next;
        });
        onSaveRef.current({ ...currentTable, records: newRecords });
        return;
      }

      // 範囲なし: Delete のみ行削除（Backspace は AG Grid の編集開始に任せる）
      if (e.key === 'Delete' && selectedRowRef.current !== null) {
        e.preventDefault();
        e.stopPropagation();
        onDeleteRowRef.current(selectedRowRef.current);
        setSelectedRow(null);
        setSelectedField(null);
      }
    };
    el.addEventListener('keydown', handler, true); // capture phase
    return () => el.removeEventListener('keydown', handler, true);
  }, []);

  // validation 変化時に cellStyle を強制再評価（_errFields はrow dataに含まれるが cellStyle は値変化がないと再呼されない）
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ force: true });
  }, [validation]);

  // 範囲選択の変化を cellStyle に反映
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ force: true });
  }, [cellRange]);

  // Table-level validation errors (recordIndex === -1)
  const tableErrors = validation?.errors.filter((e) => e.recordIndex === -1) ?? [];
  const recordErrors = validation?.errors.filter((e) => e.recordIndex >= 0) ?? [];

  return (
    <div style={styles.container}>
      <div
        ref={gridContainerRef}
        className="ag-theme-alpine"
        style={{ ...styles.grid, position: 'relative' }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onMouseDown={handleGridMouseDown}
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
          onColumnMoved={onColumnMoved}
          onColumnResized={onColumnResized}
          onFilterChanged={() => {
            const model = gridRef.current?.api?.getFilterModel();
            setFilterActive(!!model && Object.keys(model).length > 0);
            // 表示インデックスが変わるため範囲を解除
            setCellRange(null);
          }}
          onSortChanged={() => {
            // 表示インデックスが変わるため範囲を解除
            setCellRange(null);
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
      {fieldEditTargetDef && (
        <FieldEditModal
          key={fieldEditTargetDef.name}
          field={fieldEditTargetDef}
          onSave={(updated) => {
            const newFields = table.fields.map((f) => f.name === updated.name ? updated : f);
            onSave({ ...table, fields: newFields });
          }}
          onClose={() => setFieldEditTarget(null)}
        />
      )}
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
