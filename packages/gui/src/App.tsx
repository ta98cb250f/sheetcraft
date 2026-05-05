import { useState, useCallback, useEffect, useRef } from 'react';
import { useProject } from './hooks/useProject.js';
import { Toolbar } from './components/Toolbar.js';
import { TableList } from './components/TableList.js';
import { TableView } from './components/TableView.js';
import { validateTable as validateTableFn, isRichCell, exportToJSON, exportToCSV } from '@sheetcraft/core';
import type { TableFile, ValidationResult, Cell } from '@sheetcraft/core';

const MAX_HISTORY = 50;

function getNumericCellValue(cell: Cell | Cell[] | undefined): number {
  if (typeof cell === 'number') return cell;
  if (cell !== null && !Array.isArray(cell) && isRichCell(cell as Cell)) {
    if (typeof (cell as { value?: unknown }).value === 'number') return (cell as { value: number }).value;
  }
  return 0;
}

export function App() {
  const { state, loading, error, savedFolderName, openFolder, reopenLastFolder, selectTable, saveTable } = useProject();
  const [dirty, setDirty] = useState(false);
  const [pendingTable, setPendingTable] = useState<TableFile | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Undo/Redo history (per selected table)
  const historyRef = useRef<TableFile[]>([]);
  const futureRef = useRef<TableFile[]>([]);

  const currentTable = state.selectedTable
    ? (pendingTable ?? state.tables.get(state.selectedTable) ?? null)
    : null;

  // Auto-validate with debounce on every change
  useEffect(() => {
    if (!currentTable) { setValidation(null); return; }
    const refTables = new Map(
      [...state.tables.values()].map((t) => [t.table, t])
    );
    if (pendingTable) refTables.set(pendingTable.table, pendingTable);
    const timer = setTimeout(() => {
      setValidation(validateTableFn(currentTable, {
        baseFields: state.baseFields ?? undefined,
        enums: state.enums ?? undefined,
        refTables,
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [currentTable, state.baseFields, state.enums, state.tables]);

  const handleTableChange = useCallback((updated: TableFile, skipHistory = false) => {
    if (!skipHistory) {
      // Use pendingTable if dirty, otherwise the last saved version — ensures first edit is undoable
      const base = pendingTable ?? (state.selectedTable ? state.tables.get(state.selectedTable) ?? null : null);
      if (base) {
        historyRef.current = [...historyRef.current.slice(-MAX_HISTORY), base];
        futureRef.current = [];
      }
    }
    setPendingTable(updated);
    setDirty(true);
  }, [pendingTable, state.selectedTable, state.tables]);

  const handleUndo = useCallback(() => {
    const hist = historyRef.current;
    if (hist.length === 0) return;
    const prev = hist[hist.length - 1];
    historyRef.current = hist.slice(0, -1);
    if (pendingTable) futureRef.current = [pendingTable, ...futureRef.current];
    setPendingTable(prev);
    setDirty(true);
  }, [pendingTable]);

  const handleRedo = useCallback(() => {
    const fut = futureRef.current;
    if (fut.length === 0) return;
    const next = fut[0];
    futureRef.current = fut.slice(1);
    if (pendingTable) historyRef.current = [...historyRef.current, pendingTable];
    setPendingTable(next);
    setDirty(true);
  }, [pendingTable]);

  // Global keyboard: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const handleSave = useCallback(async () => {
    if (!state.selectedTable || !pendingTable) return;
    await saveTable(state.selectedTable, pendingTable);
    setPendingTable(null);
    setDirty(false);
    historyRef.current = [];
    futureRef.current = [];
  }, [state.selectedTable, pendingTable, saveTable]);

  const handleSelectTable = useCallback((name: string) => {
    setPendingTable(null);
    setDirty(false);
    setValidation(null);
    historyRef.current = [];
    futureRef.current = [];
    selectTable(name);
  }, [selectTable]);

  // Add row: auto-increment id from max existing id
  const handleAddRow = useCallback(() => {
    if (!currentTable) return;
    const maxId = currentTable.records.reduce((m, r) => {
      const v = getNumericCellValue(r['id'] as Cell | undefined);
      return v > m ? v : m;
    }, 0);
    const newRecord = { id: maxId + 1, version: 1 };
    handleTableChange({ ...currentTable, records: [...currentTable.records, newRecord] });
  }, [currentTable, handleTableChange]);

  const downloadFile = useCallback((content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const handleExportJSON = useCallback(() => {
    if (!currentTable || !state.selectedTable) return;
    const refTables = new Map([...state.tables.values()].map((t) => [t.table, t]));
    const json = exportToJSON(currentTable, { baseFields: state.baseFields ?? undefined, refTables, pretty: true });
    const name = state.selectedTable.replace(/\.json$/, '') + '_export.json';
    downloadFile(json, name, 'application/json');
  }, [currentTable, state.selectedTable, state.tables, state.baseFields, downloadFile]);

  const handleExportCSV = useCallback(() => {
    if (!currentTable || !state.selectedTable) return;
    const refTables = new Map([...state.tables.values()].map((t) => [t.table, t]));
    const csv = exportToCSV(currentTable, { baseFields: state.baseFields ?? undefined, refTables });
    const name = state.selectedTable.replace(/\.json$/, '') + '_export.csv';
    downloadFile(csv, name, 'text/csv');
  }, [currentTable, state.selectedTable, state.tables, state.baseFields, downloadFile]);

  // Delete row by record index
  const handleDeleteRow = useCallback((recordIndex: number) => {
    if (!currentTable) return;
    const newRecords = currentTable.records.filter((_, i) => i !== recordIndex);
    handleTableChange({ ...currentTable, records: newRecords });
  }, [currentTable, handleTableChange]);

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  return (
    <div style={styles.root}>
      <Toolbar
        hasFolder={state.tableNames.length > 0}
        hasTable={!!currentTable}
        isDirty={dirty}
        canUndo={canUndo}
        canRedo={canRedo}
        validation={validation}
        savedFolderName={savedFolderName}
        onOpenFolder={openFolder}
        onReopenLastFolder={reopenLastFolder}
        onSave={handleSave}
        onAddRow={handleAddRow}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
      />
      <div style={styles.body}>
        {state.tableNames.length > 0 && (
          <TableList
            tableNames={state.tableNames}
            tables={state.tables}
            selected={state.selectedTable}
            onSelect={handleSelectTable}
          />
        )}
        <main style={styles.main}>
          {loading && <div style={styles.message}>読み込み中...</div>}
          {error && <div style={{ ...styles.message, color: '#e53935' }}>{error}</div>}
          {!loading && !error && !currentTable && (
            <div style={styles.message}>
              「フォルダを開く」をクリックしてマスターデータフォルダを選択してください。
              {savedFolderName && state.tableNames.length === 0 && (
                <div style={{ marginTop: 12 }}>
                  <button
                    style={{ fontSize: 13, padding: '6px 14px', cursor: 'pointer', borderRadius: 4, border: '1px solid #ccc' }}
                    onClick={reopenLastFolder}
                  >
                    最近のフォルダ「{savedFolderName}」を開く
                  </button>
                </div>
              )}
            </div>
          )}
          {currentTable && (
            <TableView
              table={currentTable}
              enums={state.enums}
              cellColors={state.cellColors}
              baseFields={state.baseFields}
              validation={validation}
              onSave={handleTableChange}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
            />
          )}
        </main>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  message: { padding: 32, color: '#555', fontSize: 14 },
};
