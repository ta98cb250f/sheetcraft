import { useMemo, useState, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import type {
  ColDef,
  CellValueChangedEvent,
  CellClickedEvent,
  GetContextMenuItemsParams,
  MenuItemDef,
  ICellRendererParams,
  RowDragEndEvent,
} from 'ag-grid-community';
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

type Props = {
  table: TableFile;
  enums: EnumsConfig | null;
  cellColors: CellColorsConfig | null;
  baseFields: BaseFieldsConfig | null;
  validation: ValidationResult | null;
  onSave: (table: TableFile) => void;
  onAddRow: () => void;
  onDeleteRow: (recordIndex: number) => void;
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

function parseValue(raw: unknown, field: FieldDef): Cell {
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
  return raw as Cell;
}

type SearchState = { show: boolean; mode: 'search' | 'replace' };

export function TableView({
  table, enums, cellColors, baseFields, validation, onSave, onAddRow, onDeleteRow,
}: Props) {
  const gridRef = useRef<AgGridReact>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set());

  const fields = useMemo(() => {
    return baseFields ? resolveFields(table.fields, baseFields) : table.fields;
  }, [table.fields, baseFields]);

  const rowData = useMemo(() => {
    return table.records.map((record, idx) => {
      const computed = computeRecord(record, fields);
      const row: { [k: string]: unknown } & { _idx: number } = { _idx: idx };
      for (const f of fields) {
        row[f.name] = getCellDisplayValue(computed[f.name] as Cell | undefined);
      }
      return row;
    });
  }, [table.records, fields]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 60,
  }), []);

  const colDefs = useMemo<ColDef[]>(() => {
    return fields.map((f, i) => {
      const isEditable = f.type !== 'computed' && f.editable !== false && !f.auto;

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

      const records = table.records;
      const CommentCellRenderer = (params: ICellRendererParams) => {
        const rowIdx = (params.data as { _idx: number })._idx;
        const raw = records[rowIdx]?.[f.name];
        const hasComment = isRichCell(raw as Cell) && !!(raw as RichCell).comment;
        const val = String(params.value ?? '');
        if (!hasComment) return val;
        return (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: 0, height: 0, borderStyle: 'solid',
              borderWidth: '0 7px 7px 0',
              borderColor: 'transparent #f57c00 transparent transparent',
            }} title={(raw as RichCell).comment ?? ''} />
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
        pinned: pinnedColumns.has(f.name) ? ('left' as const) : undefined,
        cellStyle: (params: { data: { _idx: number } }) => {
          const rowIdx = params.data._idx;
          const hasError = validation?.errors.some(
            (e) => e.recordIndex === rowIdx && e.field === f.name
          );
          const hasWarn = validation?.warnings.some(
            (w) => w.recordIndex === rowIdx && w.field === f.name
          );
          if (hasError) return { border: '2px solid #e53935', background: '#fff8f8', color: 'inherit', fontStyle: 'normal' };
          if (hasWarn) return { border: '2px solid #fdd835', background: '#fffde7', color: 'inherit', fontStyle: 'normal' };
          if (f.type === 'computed') return { color: '#999', fontStyle: 'italic', border: '', background: '' };
          return null;
        },
      };
    });
  }, [fields, enums, validation, table.records, pinnedColumns]);

  const onCellValueChanged = useCallback((e: CellValueChangedEvent) => {
    const rowIdx = (e.data as { _idx: number })._idx;
    const fieldName = e.colDef.field;
    if (!fieldName) return;
    const field = fields.find((f) => f.name === fieldName);
    if (!field) return;

    const parsed = parseValue(e.newValue, field);
    const newRecords = table.records.map((r, i) => {
      if (i !== rowIdx) return r;
      const existing = r[fieldName];
      if (isRichCell(existing as Cell)) {
        return { ...r, [fieldName]: { ...(existing as RichCell), value: parsed as SimpleCell } };
      }
      return { ...r, [fieldName]: parsed };
    });
    onSave({ ...table, records: newRecords });
  }, [fields, table, onSave]);

  const onCellClicked = useCallback((e: CellClickedEvent) => {
    const rowIdx = (e.data as { _idx: number })._idx;
    setSelectedRow(rowIdx);
    setSelectedField(e.colDef.field ?? null);
  }, []);

  const selectedCell = useMemo<Cell | null>(() => {
    if (selectedRow === null || !selectedField) return null;
    const record = table.records[selectedRow];
    if (!record) return null;
    return (record[selectedField] as Cell) ?? null;
  }, [selectedRow, selectedField, table.records]);

  const handleCellUpdate = useCallback((newCell: Cell) => {
    if (selectedRow === null || !selectedField) return;
    const newRecords = table.records.map((r, i) => {
      if (i !== selectedRow) return r;
      return { ...r, [selectedField]: newCell };
    });
    onSave({ ...table, records: newRecords });
  }, [selectedRow, selectedField, table, onSave]);

  // Ctrl+V paste handler (multi-cell TSV)
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!gridRef.current?.api) return;
    if (gridRef.current.api.getEditingCells().length > 0) return;

    const focusedCell = gridRef.current.api.getFocusedCell();
    if (!focusedCell) return;

    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const pasteRows = text.split(/\r?\n/).filter((r) => r !== '');
    const startRow = focusedCell.rowIndex;
    const startColIdx = fields.findIndex((f) => f.name === focusedCell.column.getColId());
    if (startColIdx === -1) return;

    const newRecords = [...table.records];
    pasteRows.forEach((rowText, rowOffset) => {
      const recordIdx = startRow + rowOffset;
      if (recordIdx >= newRecords.length) return;
      const values = rowText.split('\t');
      const record = { ...newRecords[recordIdx] };
      values.forEach((val, colOffset) => {
        const field = fields[startColIdx + colOffset];
        if (!field || field.type === 'computed' || field.editable === false || field.auto) return;
        const parsed = parseValue(val, field);
        const existing = record[field.name];
        if (isRichCell(existing as Cell)) {
          record[field.name] = { ...(existing as RichCell), value: parsed as SimpleCell };
        } else {
          record[field.name] = parsed;
        }
      });
      newRecords[recordIdx] = record;
    });

    onSave({ ...table, records: newRecords });
    e.preventDefault();
  }, [fields, table, onSave]);

  // Keyboard: Ctrl+C (multi-row copy), Ctrl+D (fill-down), Ctrl+F/H (search), Delete (row)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
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
      const selectedRows = gridRef.current.api.getSelectedRows() as Array<{ _idx: number } & Record<string, unknown>>;
      if (selectedRows.length > 1) {
        const tsv = selectedRows.map((row) =>
          fields.map((f) => String(row[f.name] ?? '')).join('\t')
        ).join('\n');
        navigator.clipboard.writeText(tsv).catch((err) => console.warn('clipboard write failed:', err));
        e.preventDefault();
        return;
      }
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
      if (!field || field.type === 'computed' || field.editable === false || field.auto) return;

      const selectedRows = (gridRef.current.api.getSelectedRows() as Array<{ _idx: number } & Record<string, unknown>>)
        .sort((a, b) => a._idx - b._idx);
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
  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams): (string | MenuItemDef)[] => {
      const rowIdx = params.node
        ? (params.node.data as { _idx: number })._idx
        : null;
      const fieldName = params.column?.getColId() ?? null;
      const field = fieldName ? fields.find((f) => f.name === fieldName) : null;
      const isPinned = fieldName ? pinnedColumns.has(fieldName) : false;

      const colorItems: MenuItemDef[] = cellColors
        ? Object.entries(cellColors.cell_colors).map(([key, def]) => ({
            name: `<span style="display:inline-block;width:12px;height:12px;background:${def.hex};border:1px solid #999;border-radius:2px;margin-right:6px;vertical-align:middle"></span>${def.label ?? key}`,
            action: () => {
              if (rowIdx !== null && fieldName) updateCellRich(rowIdx, fieldName, { color: key });
            },
          }))
        : [];

      const richCellItems: (string | MenuItemDef)[] =
        rowIdx !== null && fieldName
          ? [
              'separator',
              {
                name: '色を設定',
                disabled: colorItems.length === 0,
                subMenu: colorItems.length > 0 ? colorItems : undefined,
              },
              {
                name: 'コメントを編集',
                action: () => {
                  const existing = table.records[rowIdx]?.[fieldName];
                  const current = isRichCell(existing as Cell) ? (existing as RichCell).comment ?? '' : '';
                  const result = window.prompt('コメントを入力してください:', current);
                  if (result !== null) updateCellRich(rowIdx, fieldName, { comment: result || undefined });
                },
              },
            ]
          : [];

      const overrideItem: (string | MenuItemDef)[] =
        field?.type === 'computed' && rowIdx !== null && fieldName
          ? [
              {
                name: '式をオーバーライド',
                action: () => {
                  const existing = table.records[rowIdx]?.[fieldName];
                  const current = isRichCell(existing as Cell) ? (existing as RichCell).override ?? '' : '';
                  const result = window.prompt('オーバーライド式を入力（空白で解除）:', current);
                  if (result !== null) updateCellRich(rowIdx, fieldName, { override: result || undefined });
                },
              },
            ]
          : [];

      const pinItem: (string | MenuItemDef)[] = fieldName
        ? [
            'separator',
            {
              name: isPinned ? 'この列の固定を解除' : 'この列を左に固定',
              action: () => {
                setPinnedColumns((prev) => {
                  const next = new Set(prev);
                  if (isPinned) next.delete(fieldName);
                  else next.add(fieldName);
                  return next;
                });
              },
            },
          ]
        : [];

      return [
        { name: '行を追加', action: onAddRow },
        ...(rowIdx !== null
          ? [{
              name: '行を削除',
              action: () => {
                onDeleteRow(rowIdx);
                setSelectedRow(null);
                setSelectedField(null);
              },
            }]
          : []),
        ...richCellItems,
        ...overrideItem,
        ...pinItem,
        'separator',
        'copy',
      ];
    },
    [onAddRow, onDeleteRow, cellColors, table.records, updateCellRich, fields, pinnedColumns]
  );

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
        if (!field || field.type === 'computed' || field.editable === false || field.auto) continue;
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

  // Table-level validation errors (recordIndex === -1)
  const tableErrors = validation?.errors.filter((e) => e.recordIndex === -1) ?? [];
  const recordErrors = validation?.errors.filter((e) => e.recordIndex >= 0) ?? [];

  return (
    <div
      style={styles.container}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="ag-theme-alpine" style={{ ...styles.grid, position: 'relative' }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          onCellValueChanged={onCellValueChanged}
          onCellClicked={onCellClicked}
          rowSelection="multiple"
          rowDragManaged
          onRowDragEnd={onRowDragEnd}
          animateRows
          stopEditingWhenCellsLoseFocus
          getContextMenuItems={getContextMenuItems}
        />
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
      <CellDetailPanel
        fieldName={selectedField}
        cell={selectedCell}
        cellColors={cellColors}
        onUpdate={handleCellUpdate}
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
