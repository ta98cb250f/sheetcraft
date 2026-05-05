import { useState, useCallback } from 'react';
import { useProject } from './hooks/useProject.js';
import { Toolbar } from './components/Toolbar.js';
import { TableList } from './components/TableList.js';
import { TableView } from './components/TableView.js';
import type { TableFile, ValidationResult } from '@sheetcraft/core';

export function App() {
  const { state, loading, error, openFolder, selectTable, saveTable, validateCurrentTable } = useProject();
  const [dirty, setDirty] = useState(false);
  const [pendingTable, setPendingTable] = useState<TableFile | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const currentTable = state.selectedTable
    ? (pendingTable ?? state.tables.get(state.selectedTable) ?? null)
    : null;

  const handleTableChange = useCallback((updated: TableFile) => {
    setPendingTable(updated);
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!state.selectedTable || !pendingTable) return;
    await saveTable(state.selectedTable, pendingTable);
    setPendingTable(null);
    setDirty(false);
  }, [state.selectedTable, pendingTable, saveTable]);

  const handleValidate = useCallback(() => {
    const result = validateCurrentTable();
    setValidation(result);
    if (result?.valid) alert('バリデーション成功: エラーなし');
    else if (result) alert(`バリデーション: ${result.errors.length} 件のエラー, ${result.warnings.length} 件の警告`);
  }, [validateCurrentTable]);

  const handleSelectTable = useCallback((name: string) => {
    setPendingTable(null);
    setDirty(false);
    setValidation(null);
    selectTable(name);
  }, [selectTable]);

  return (
    <div style={styles.root}>
      <Toolbar
        hasFolder={state.tableNames.length > 0}
        isDirty={dirty}
        onOpenFolder={openFolder}
        onSave={handleSave}
        onValidate={handleValidate}
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
