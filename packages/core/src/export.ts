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

// ---- MessagePack encoder (pure-JS, no dependencies) ----

const _encoder = new TextEncoder();

function mpEncodeValue(value: unknown, out: Uint8Array[]): void {
  if (value === null || value === undefined) {
    out.push(new Uint8Array([0xc0]));
    return;
  }
  if (typeof value === 'boolean') {
    out.push(new Uint8Array([value ? 0xc3 : 0xc2]));
    return;
  }
  if (typeof value === 'number') {
    mpEncodeNumber(value, out);
    return;
  }
  if (typeof value === 'string') {
    mpEncodeString(value, out);
    return;
  }
  if (Array.isArray(value)) {
    mpEncodeArray(value, out);
    return;
  }
  if (typeof value === 'object') {
    mpEncodeMap(value as Record<string, unknown>, out);
    return;
  }
}

function mpEncodeNumber(n: number, out: Uint8Array[]): void {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    const buf = new ArrayBuffer(9);
    const view = new DataView(buf);
    view.setUint8(0, 0xcb);
    view.setFloat64(1, n, false);
    out.push(new Uint8Array(buf));
    return;
  }
  if (n >= 0) {
    if (n <= 0x7f) { out.push(new Uint8Array([n])); }
    else if (n <= 0xff) { out.push(new Uint8Array([0xcc, n])); }
    else if (n <= 0xffff) { out.push(new Uint8Array([0xcd, (n >> 8) & 0xff, n & 0xff])); }
    else if (n <= 0xffffffff) {
      out.push(new Uint8Array([0xce, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]));
    } else {
      const buf = new ArrayBuffer(9);
      new DataView(buf).setFloat64(1, n, false);
      new Uint8Array(buf)[0] = 0xcb;
      out.push(new Uint8Array(buf));
    }
  } else {
    if (n >= -32) { out.push(new Uint8Array([n & 0xff])); }
    else if (n >= -128) { out.push(new Uint8Array([0xd0, n & 0xff])); }
    else if (n >= -32768) { out.push(new Uint8Array([0xd1, (n >> 8) & 0xff, n & 0xff])); }
    else if (n >= -2147483648) {
      out.push(new Uint8Array([0xd2, (n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]));
    } else {
      const buf = new ArrayBuffer(9);
      new DataView(buf).setFloat64(1, n, false);
      new Uint8Array(buf)[0] = 0xcb;
      out.push(new Uint8Array(buf));
    }
  }
}

function mpEncodeString(s: string, out: Uint8Array[]): void {
  const bytes = _encoder.encode(s);
  const len = bytes.length;
  if (len <= 31) { out.push(new Uint8Array([0xa0 | len])); }
  else if (len <= 0xff) { out.push(new Uint8Array([0xd9, len])); }
  else if (len <= 0xffff) { out.push(new Uint8Array([0xda, (len >> 8) & 0xff, len & 0xff])); }
  else { out.push(new Uint8Array([0xdb, (len >>> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff])); }
  out.push(bytes);
}

function mpEncodeArray(arr: unknown[], out: Uint8Array[]): void {
  const len = arr.length;
  if (len <= 15) { out.push(new Uint8Array([0x90 | len])); }
  else if (len <= 0xffff) { out.push(new Uint8Array([0xdc, (len >> 8) & 0xff, len & 0xff])); }
  else { out.push(new Uint8Array([0xdd, (len >>> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff])); }
  for (const item of arr) mpEncodeValue(item, out);
}

function mpEncodeMap(obj: Record<string, unknown>, out: Uint8Array[]): void {
  const keys = Object.keys(obj);
  const len = keys.length;
  if (len <= 15) { out.push(new Uint8Array([0x80 | len])); }
  else if (len <= 0xffff) { out.push(new Uint8Array([0xde, (len >> 8) & 0xff, len & 0xff])); }
  else { out.push(new Uint8Array([0xdf, (len >>> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff])); }
  for (const key of keys) {
    mpEncodeString(key, out);
    mpEncodeValue(obj[key], out);
  }
}

function mpConcat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { result.set(p, offset); offset += p.length; }
  return result;
}

export function exportToMsgPack(
  table: TableFile,
  opts: {
    baseFields?: BaseFieldsConfig;
    refTables?: Map<string, TableFile>;
  } = {}
): Uint8Array {
  const fields = opts.baseFields
    ? resolveFields(table.fields, opts.baseFields)
    : table.fields;
  const rows = table.records.map((r) => buildExportRecord(r, fields, opts.refTables));
  const parts: Uint8Array[] = [];
  mpEncodeValue(rows, parts);
  return mpConcat(parts);
}
