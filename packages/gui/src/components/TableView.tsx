import { useMemo, useState, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import type { ColDef, CellClickedEvent } from 'ag-grid-community';
import type {
  TableFile,
  FieldDef,
  Record,
  Cell,
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
};

function getCellDisplayValue(cell: Cell | Cell[] | undefined): string {
  if (cell === undefined || cell === null) return '';
  if (Array.isArray(cell)) return cell.join(', ');
  if (isRichCell(cell)) {
    if (cell.value !== undefined) return String(cell.value);
    if (cell.override) return `[${cell.override}]`;
    return '';
  }
  return String(cell);
}

export function TableView({ table, enums, cellColors, baseFields, validation, onSave }: Props) {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);

  const fields = useMemo(() => {
    return baseFields ? resolveFields(table.fields, baseFields) : table.fields;
  }, [table.fields, baseFields]);

  const rowData = useMemo(() => {
    return table.records.map((record, idx) => {
      const computed = computeRecord(record, fields);
      const row: { [k: string]: unknown; _idx: number } = { _idx: idx };
      for (const f of fields) {
        row[f.name] = getCellDisplayValue(computed[f.name] as Cell | undefined);
      }
      return row;
    });
  }, [table.records, fields]);

  const colDefs = useMemo<ColDef[]>(() => {
    return fields.map((f) => ({
      field: f.name,
      headerName: f.display_name ?? f.name,
      editable: f.type !== 'computed' && f.editable !== false && !f.auto,
      flex: 1,
      minWidth: 80,
      headerClass: f.export === false ? 'header-no-export' : '',
      cellStyle: (params: { data: { _idx: number } }) => {
        const rowIdx = params.data._idx;
        const hasError = validation?.errors.some((e) => e.recordIndex === rowIdx && e.field === f.name);
        const hasWarn = validation?.warnings.some((e) => e.recordIndex === rowIdx && e.field === f.name);
        if (hasError) return { border: '2px solid #e53935' };
        if (hasWarn) return { border: '2px solid #fdd835' };
        if (f.type === 'computed') return { color: '#999', fontStyle: 'italic' };
        return null;
      },
    }));
  }, [fields, validation]);

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

  const handleCellEdit = useCallback((e: { rowIndex: number | null; colDef: ColDef; newValue: string }) => {
    if (e.rowIndex === null) return;
    const field = fields.find((f) => f.field === e.colDef.field || f.name === e.colDef.field);
    if (!field) return;
    const raw = e.newValue;
    let value: Cell = raw;
    if (field.type === 'int' || field.type === 'float') {
      const n = Number(raw);
      value = isNaN(n) ? raw : n;
    } else if (field.type === 'bool') {
      value = raw === 'true' || raw === '1';
    }
    const newRecords = [...table.records];
    const existing = newRecords[e.rowIndex];
    if (isRichCell(existing[field.name] as Cell)) {
      value = { ...(existing[field.name] as Record), value } as Cell;
    }
    newRecords[e.rowIndex] = { ...existing, [field.name]: value };
    onSave({ ...table, records: newRecords });
  }, [fields, table, onSave]);

  return (
    <div style={styles.container}>
      <div className="ag-theme-alpine" style={styles.grid}>
        <AgGridReact
          rowData={rowData}
          columnDefs={colDefs}
          onCellClicked={onCellClicked}
          onCellValueChanged={handleCellEdit as never}
          rowSelection="single"
          animateRows={true}
        />
      </div>
      <CellDetailPanel
        fieldName={selectedField}
        cell={selectedCell}
        cellColors={cellColors}
        onUpdate={handleCellUpdate}
      />
      {validation && !validation.valid && (
        <div style={styles.errorPanel}>
          {validation.errors.map((e, i) => (
            <div key={i} style={styles.errorItem}>
              行{e.recordIndex + 1} / {e.field}: {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  grid: { flex: 1, overflow: 'hidden' },
  errorPanel: {
    maxHeight: 100,
    overflowY: 'auto',
    background: '#fff3f3',
    borderTop: '1px solid #e53935',
    padding: '4px 12px',
  },
  errorItem: { fontSize: 12, color: '#c62828', padding: '2px 0' },
};
