import { useEffect, useMemo, useState } from 'react';
import {
  parseTableFile,
  parseEnumsConfig,
  parseBaseFieldsConfig,
  parseCellColorsConfig,
  validateTable,
  resolveFields,
} from '@sheetcraft/core';
import type {
  TableFile,
  ValidationResult,
} from '@sheetcraft/core';
import { GlideTableView } from './GlideTableView.js';
import characterJson from '../../../example/master/character.json';
import enumsJson from '../../../example/master/enums.json';
import baseFieldsJson from '../../../example/master/base_fields.json';
import cellColorsJson from '../../../example/master/cell_colors.json';

export function App() {
  // 初期データを同期的にパース
  const initialTable = useMemo(() => parseTableFile(characterJson), []);
  const enums = useMemo(() => parseEnumsConfig(enumsJson), []);
  const baseFields = useMemo(() => parseBaseFieldsConfig(baseFieldsJson), []);
  const cellColors = useMemo(() => parseCellColorsConfig(cellColorsJson), []);

  const [table, setTable] = useState<TableFile>(initialTable);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  useEffect(() => {
    setValidation(validateTable(table, { baseFields, enums }));
  }, [table, baseFields, enums]);

  const fields = baseFields ? resolveFields(table.fields, baseFields) : table.fields;
  const errorCount = validation?.errors.length ?? 0;
  const warnCount = validation?.warnings.length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #ddd', gap: 12 }}>
        <strong style={{ color: '#1a73e8' }}>SheetCraft Proto</strong>
        <span style={{ fontSize: 12, color: '#666' }}>{table.display_name ?? table.table}</span>
        <span style={{ fontSize: 12, color: '#999' }}>Glide Data Grid v6</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {errorCount > 0 && (
            <span style={{ fontSize: 12, padding: '2px 8px', background: '#ffebee', color: '#c62828', borderRadius: 10 }}>
              ✕ {errorCount}
            </span>
          )}
          {warnCount > 0 && (
            <span style={{ fontSize: 12, padding: '2px 8px', background: '#fff8e1', color: '#f57f17', borderRadius: 10 }}>
              ⚠ {warnCount}
            </span>
          )}
        </div>
      </header>
      <main style={{ flex: 1, overflow: 'hidden' }}>
        <GlideTableView
          table={table}
          fields={fields}
          enums={enums}
          cellColors={cellColors}
          validation={validation}
          onChange={setTable}
        />
      </main>
    </div>
  );
}
