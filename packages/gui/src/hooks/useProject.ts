import { useState, useCallback } from 'react';
import { LocalFileBackend } from '../backend/FileBackend.js';
import {
  parseTableFile,
  parseEnumsConfig,
  parseCellColorsConfig,
  parseBaseFieldsConfig,
  validateTable,
} from '@sheetcraft/core';
import type {
  TableFile,
  EnumsConfig,
  CellColorsConfig,
  BaseFieldsConfig,
  ValidationResult,
} from '@sheetcraft/core';

export type ProjectState = {
  tables: Map<string, TableFile>;
  tableNames: string[];
  enums: EnumsConfig | null;
  cellColors: CellColorsConfig | null;
  baseFields: BaseFieldsConfig | null;
  selectedTable: string | null;
};

const initialState: ProjectState = {
  tables: new Map(),
  tableNames: [],
  enums: null,
  cellColors: null,
  baseFields: null,
  selectedTable: null,
};

export function useProject() {
  const [backend] = useState(() => new LocalFileBackend());
  const [state, setState] = useState<ProjectState>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFolder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await backend.open();
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const reload = useCallback(async () => {
    const files = await backend.listFiles();
    const tables = new Map<string, TableFile>();
    let enums: EnumsConfig | null = null;
    let cellColors: CellColorsConfig | null = null;
    let baseFields: BaseFieldsConfig | null = null;

    for (const file of files) {
      const text = await backend.readFile(file);
      const json = JSON.parse(text) as unknown;
      if (file === 'enums.json') { enums = parseEnumsConfig(json); continue; }
      if (file === 'cell_colors.json') { cellColors = parseCellColorsConfig(json); continue; }
      if (file === 'base_fields.json') { baseFields = parseBaseFieldsConfig(json); continue; }
      try {
        const table = parseTableFile(json);
        tables.set(file, table);
      } catch {
        // skip non-table JSON files
      }
    }

    setState((prev) => ({
      tables,
      tableNames: [...tables.keys()],
      enums,
      cellColors,
      baseFields,
      selectedTable: prev.selectedTable ?? (tables.size > 0 ? tables.keys().next().value ?? null : null),
    }));
  }, [backend]);

  const selectTable = useCallback((filename: string) => {
    setState((prev) => ({ ...prev, selectedTable: filename }));
  }, []);

  const saveTable = useCallback(async (filename: string, table: TableFile) => {
    const text = JSON.stringify(table, null, 2);
    await backend.writeFile(filename, text);
    setState((prev) => {
      const tables = new Map(prev.tables);
      tables.set(filename, table);
      return { ...prev, tables };
    });
  }, [backend]);

  const validateCurrentTable = useCallback((): ValidationResult | null => {
    if (!state.selectedTable) return null;
    const table = state.tables.get(state.selectedTable);
    if (!table) return null;
    const refTables = new Map(
      [...state.tables.values()].map((t) => [t.table, t])
    );
    return validateTable(table, {
      baseFields: state.baseFields ?? undefined,
      enums: state.enums ?? undefined,
      refTables,
    });
  }, [state]);

  return {
    state,
    loading,
    error,
    openFolder,
    selectTable,
    saveTable,
    validateCurrentTable,
  };
}
