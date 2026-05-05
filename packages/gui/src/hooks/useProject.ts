import { useState, useCallback, useEffect } from 'react';
import { LocalFileBackend } from '../backend/FileBackend.js';
import { saveHandle, loadHandle } from '../lib/folderStorage.js';
import {
  parseTableFile,
  parseEnumsConfig,
  parseCellColorsConfig,
  parseBaseFieldsConfig,
} from '@sheetcraft/core';
import type {
  TableFile,
  EnumsConfig,
  CellColorsConfig,
  BaseFieldsConfig,
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
  const [savedFolderName, setSavedFolderName] = useState<string | null>(null);

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

  // On mount: try to restore last folder handle from IndexedDB
  useEffect(() => {
    void (async () => {
      const handle = await loadHandle();
      if (!handle) return;
      setSavedFolderName(handle.name);
      // Check if permission is already granted (doesn't prompt user)
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        backend.openWithHandle(handle);
        setLoading(true);
        try {
          await reload();
        } catch {
          // silently ignore — user can open manually
        } finally {
          setLoading(false);
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFolder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await backend.open();
      const handle = backend.getHandle();
      if (handle) {
        setSavedFolderName(handle.name);
        await saveHandle(handle);
      }
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [backend, reload]);

  // Reopen the saved folder with a user gesture (requests permission if needed)
  const reopenLastFolder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const handle = await loadHandle();
      if (!handle) return;
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        setError('フォルダへのアクセスが許可されませんでした');
        return;
      }
      backend.openWithHandle(handle);
      setSavedFolderName(handle.name);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [backend, reload]);

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

  return {
    state,
    loading,
    error,
    savedFolderName,
    openFolder,
    reopenLastFolder,
    selectTable,
    saveTable,
  };
}
