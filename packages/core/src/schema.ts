import type {
  TableFile,
  FieldDef,
  EnumsConfig,
  BaseFieldsConfig,
  CellColorsConfig,
  ProjectConfig,
  Record,
} from './types.js';

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

const VALID_TYPES = new Set([
  'int', 'float', 'string', 'bool', 'enum',
  'list<int>', 'list<string>',
]);

export function parseTableFile(raw: unknown): TableFile {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SchemaError('Table file must be a JSON object');
  }
  const obj = raw as Record;

  if (typeof obj['table'] !== 'string' || !obj['table']) {
    throw new SchemaError('Table file must have a "table" string field');
  }
  if (!Array.isArray(obj['fields'])) {
    throw new SchemaError('Table file must have a "fields" array');
  }
  if (!Array.isArray(obj['records'])) {
    throw new SchemaError('Table file must have a "records" array');
  }

  const fields = (obj['fields'] as unknown[]).map((f, i) => parseFieldDef(f, i));
  validateFieldNames(fields);

  const column_widths = obj['column_widths'];
  return {
    table: obj['table'] as string,
    display_name: typeof obj['display_name'] === 'string' ? obj['display_name'] : undefined,
    fields,
    records: obj['records'] as Record[],
    ...(column_widths && typeof column_widths === 'object' && !Array.isArray(column_widths)
      ? { column_widths: column_widths as { [k: string]: number } }
      : {}),
  };
}

function parseFieldDef(raw: unknown, index: number): FieldDef {
  if (typeof raw !== 'object' || raw === null) {
    throw new SchemaError(`Field at index ${index} must be an object`);
  }
  const f = raw as Record;

  if (typeof f['name'] !== 'string' || !f['name']) {
    throw new SchemaError(`Field at index ${index} must have a "name" string`);
  }
  if (typeof f['type'] !== 'string' || !VALID_TYPES.has(f['type'] as string)) {
    throw new SchemaError(
      `Field "${f['name']}" has invalid type "${f['type']}". Valid types: ${[...VALID_TYPES].join(', ')}`
    );
  }
  if ((f['type'] as string) === 'enum' && typeof f['enum_ref'] !== 'string') {
    throw new SchemaError(`Field "${f['name']}" of type "enum" must have "enum_ref"`);
  }

  return f as unknown as FieldDef;
}

function validateFieldNames(fields: FieldDef[]): void {
  const names = new Set<string>();
  for (const f of fields) {
    if (names.has(f.name)) {
      throw new SchemaError(`Duplicate field name: "${f.name}"`);
    }
    names.add(f.name);
  }
}

export function parseEnumsConfig(raw: unknown): EnumsConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new SchemaError('enums.json must be a JSON object');
  }
  const obj = raw as Record;
  if (typeof obj['enums'] !== 'object' || obj['enums'] === null) {
    throw new SchemaError('enums.json must have an "enums" object');
  }
  return obj as unknown as EnumsConfig;
}

export function parseBaseFieldsConfig(raw: unknown): BaseFieldsConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new SchemaError('base_fields.json must be a JSON object');
  }
  const obj = raw as Record;
  if (!Array.isArray(obj['base_fields'])) {
    throw new SchemaError('base_fields.json must have a "base_fields" array');
  }
  return obj as unknown as BaseFieldsConfig;
}

export function parseCellColorsConfig(raw: unknown): CellColorsConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new SchemaError('cell_colors.json must be a JSON object');
  }
  const obj = raw as Record;
  if (typeof obj['cell_colors'] !== 'object' || obj['cell_colors'] === null) {
    throw new SchemaError('cell_colors.json must have a "cell_colors" object');
  }
  return obj as unknown as CellColorsConfig;
}

export function parseProjectConfig(raw: unknown): ProjectConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new SchemaError('project.json must be a JSON object');
  }
  const obj = raw as Record;
  if (typeof obj['output'] !== 'object' || obj['output'] === null) {
    throw new SchemaError('project.json must have an "output" object');
  }
  return obj as unknown as ProjectConfig;
}

export function resolveFields(
  tableFields: FieldDef[],
  baseFields: BaseFieldsConfig
): FieldDef[] {
  return [...baseFields.base_fields, ...tableFields];
}
