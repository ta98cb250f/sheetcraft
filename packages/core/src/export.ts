import type { TableFile, FieldDef, Record, Cell } from './types.js';
import { isRichCell } from './types.js';
import { computeRecord } from './formula.js';
import { resolveFields } from './schema.js';
import type { BaseFieldsConfig } from './types.js';

function resolveCellValue(cell: Cell | Cell[] | undefined): unknown {
  if (cell === undefined || cell === null) return null;
  if (Array.isArray(cell)) return cell.map((c) => resolveCellValue(c));
  if (isRichCell(cell)) return cell.value ?? null;
  return cell;
}

function buildExportRecord(
  record: Record,
  fields: FieldDef[],
  refTables?: Map<string, TableFile>
): { [k: string]: unknown } {
  const computed = computeRecord(record, fields, refTables);
  const out: { [k: string]: unknown } = {};
  for (const field of fields) {
    if (field.export === false) continue;
    out[field.name] = resolveCellValue(computed[field.name] as Cell | undefined);
  }
  return out;
}

export function exportToJSON(
  table: TableFile,
  opts: {
    baseFields?: BaseFieldsConfig;
    refTables?: Map<string, TableFile>;
    pretty?: boolean;
  } = {}
): string {
  const fields = opts.baseFields
    ? resolveFields(table.fields, opts.baseFields)
    : table.fields;

  const rows = table.records.map((r) =>
    buildExportRecord(r, fields, opts.refTables)
  );
  return JSON.stringify(rows, null, opts.pretty !== false ? 2 : 0);
}

export function exportToCSV(
  table: TableFile,
  opts: {
    baseFields?: BaseFieldsConfig;
    refTables?: Map<string, TableFile>;
  } = {}
): string {
  const fields = opts.baseFields
    ? resolveFields(table.fields, opts.baseFields)
    : table.fields;
  const exportFields = fields.filter((f) => f.export !== false);

  const header = exportFields.map((f) => csvCell(f.name)).join(',');
  const rows = table.records.map((r) => {
    const computed = buildExportRecord(r, exportFields, opts.refTables);
    return exportFields
      .map((f) => {
        const v = computed[f.name];
        return csvCell(Array.isArray(v) ? JSON.stringify(v) : String(v ?? ''));
      })
      .join(',');
  });
  return [header, ...rows].join('\n');
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
