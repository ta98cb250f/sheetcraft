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

export function TableView({
  table, enums, cellColors, baseFields, validation, onSave, onAddRow, onDeleteRow,
}: Props) {
  const gridRef = useRef<AgGridReact>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);

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
    return fields.map((f) => {
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

      return {
        field: f.name,
        headerName: f.display_name ?? f.name,
        editable: isEditable,
        flex: 1,
        minWidth: 60,
        cellEditorSelector,
        headerClass: f.export === false ? 'col-no-export' : '',
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
  }, [fields, enums, validation]);

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

  // Ctrl+C copy focused cell / Delete row
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!gridRef.current?.api) return;
    const editing = gridRef.current.api.getEditingCells().length > 0;

    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !editing) {
      const fc = gridRef.current.api.getFocusedCell();
      if (!fc) return;
      const row = gridRef.current.api.getDisplayedRowAtIndex(fc.rowIndex);
      if (!row?.data) return;
      const val = (row.data as MasterRecord)[fc.column.getColId()];
      navigator.clipboard.writeText(String(val ?? '')).catch(() => {});
      e.preventDefault();
    }

    if (e.key === 'Delete' && !editing) {
      if (selectedRow !== null) {
        onDeleteRow(selectedRow);
        setSelectedRow(null);
        setSelectedField(null);
        e.preventDefault();
      }
    }
  }, [selectedRow, onDeleteRow]);

  // Right-click context menu
  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams): (string | MenuItemDef)[] => {
      const rowIdx = params.node
        ? (params.node.data as { _idx: number })._idx
        : null;
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
        'separator',
        'copy',
      ];
    },
    [onAddRow, onDeleteRow]
  );

  return (
    <div
      style={styles.container}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="ag-theme-alpine" style={styles.grid}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          onCellValueChanged={onCellValueChanged}
          onCellClicked={onCellClicked}
          rowSelection="single"
          animateRows
          stopEditingWhenCellsLoseFocus
          getContextMenuItems={getContextMenuItems}
        />
      </div>
      <CellDetailPanel
        fieldName={selectedField}
        cell={selectedCell}
        cellColors={cellColors}
        onUpdate={handleCellUpdate}
      />
      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div style={styles.messagePanel}>
          {validation.errors.map((err, i) => (
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
