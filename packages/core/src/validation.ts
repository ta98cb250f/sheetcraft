import type {
  TableFile,
  FieldDef,
  Record,
  Cell,
  EnumsConfig,
  ValidationError,
  AnomalyWarning,
  ValidationResult,
} from './types.js';
import { isRichCell } from './types.js';
import { resolveFields } from './schema.js';
import type { BaseFieldsConfig } from './types.js';
import { computeRecord, detectComputedCycles } from './formula.js';

function getCellValue(cell: Cell | Cell[] | undefined): unknown {
  if (cell === undefined || cell === null) return undefined;
  if (Array.isArray(cell)) return cell;
  if (isRichCell(cell)) return cell.value;
  return cell;
}

function getNumericValue(cell: Cell | Cell[] | undefined): number | undefined {
  const v = getCellValue(cell);
  if (typeof v === 'number') return v;
  return undefined;
}

export function validateTable(
  table: TableFile,
  opts: {
    baseFields?: BaseFieldsConfig;
    enums?: EnumsConfig;
    refTables?: Map<string, TableFile>;
  } = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: AnomalyWarning[] = [];

  const fields = opts.baseFields
    ? resolveFields(table.fields, opts.baseFields)
    : table.fields;

  const fieldMap = new Map<string, FieldDef>(fields.map((f) => [f.name, f]));

  // Collect all values per field for unique/deviation checks
  const allValues = new Map<string, unknown[]>();
  for (const field of fields) {
    allValues.set(field.name, []);
  }
  for (const record of table.records) {
    for (const field of fields) {
      const v = getCellValue(record[field.name] as Cell | undefined);
      allValues.get(field.name)!.push(v);
    }
  }

  table.records.forEach((record, recordIndex) => {
    for (const field of fields) {
      const cell = record[field.name] as Cell | Cell[] | undefined;
      const value = getCellValue(cell);

      // --- validation errors ---
      const vr = field.validation;
      if (vr) {
        if (vr.required && (value === undefined || value === null || value === '')) {
          errors.push({ table: table.table, recordIndex, field: field.name, message: '必須項目です' });
        }
        if (typeof value === 'number') {
          if (vr.min !== undefined && value < vr.min) {
            errors.push({ table: table.table, recordIndex, field: field.name, message: `最小値 ${vr.min} を下回っています（値: ${value}）` });
          }
          if (vr.max !== undefined && value > vr.max) {
            errors.push({ table: table.table, recordIndex, field: field.name, message: `最大値 ${vr.max} を超えています（値: ${value}）` });
          }
        }
        if (Array.isArray(value) && vr.max_length !== undefined && value.length > vr.max_length) {
          errors.push({ table: table.table, recordIndex, field: field.name, message: `最大要素数 ${vr.max_length} を超えています（${value.length} 要素）` });
        }
        if (typeof value === 'string') {
          if (vr.max_length !== undefined && value.length > vr.max_length) {
            errors.push({ table: table.table, recordIndex, field: field.name, message: `最大文字数 ${vr.max_length} を超えています（${value.length}文字）` });
          }
          if (vr.regex !== undefined) {
            const re = new RegExp(vr.regex);
            if (!re.test(value)) {
              errors.push({ table: table.table, recordIndex, field: field.name, message: `正規表現 ${vr.regex} にマッチしません` });
            }
          }
        }
        if (vr.unique && value !== undefined) {
          const vals = allValues.get(field.name)!;
          const count = vals.filter((v) => v === value).length;
          if (count > 1) {
            errors.push({ table: table.table, recordIndex, field: field.name, message: `値 "${value}" が重複しています` });
          }
        }
        if (vr.ref_exists && value !== undefined && opts.refTables) {
          const refField = fieldMap.get(field.name);
          if (refField?.ref) {
            const [refTable, refCol] = refField.ref.split('.');
            const rt = opts.refTables.get(refTable);
            if (rt) {
              const ids = Array.isArray(value) ? value : [value];
              for (const id of ids) {
                const found = rt.records.some(
                  (r) => getCellValue(r[refCol] as Cell | undefined) === id
                );
                if (!found) {
                  errors.push({ table: table.table, recordIndex, field: field.name, message: `参照先 ${refField.ref} に値 ${id} が存在しません` });
                }
              }
            }
          }
        }
      }

      // enum validation (independent of validation rule block)
      if (field.type === 'enum' && field.enum_ref && opts.enums && value !== undefined) {
        const enumDef = opts.enums.enums[field.enum_ref];
        if (enumDef && !enumDef.values.includes(value as string)) {
          errors.push({ table: table.table, recordIndex, field: field.name, message: `"${value}" は "${field.enum_ref}" の有効な値ではありません` });
        }
      }

      // --- anomaly warnings ---
      const ar = field.anomaly;
      if (ar && typeof value === 'number') {
        if (ar.warn_above !== undefined && value > ar.warn_above) {
          warnings.push({ table: table.table, recordIndex, field: field.name, message: `値 ${value} が警告上限 ${ar.warn_above} を超えています` });
        }
        if (ar.warn_below !== undefined && value < ar.warn_below) {
          warnings.push({ table: table.table, recordIndex, field: field.name, message: `値 ${value} が警告下限 ${ar.warn_below} を下回っています` });
        }
        if (ar.warn_deviation !== undefined) {
          const nums = allValues.get(field.name)!.filter((v) => typeof v === 'number') as number[];
          if (nums.length > 1) {
            const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
            const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
            const stddev = Math.sqrt(variance);
            if (stddev > 0 && Math.abs(value - mean) > ar.warn_deviation * stddev) {
              warnings.push({ table: table.table, recordIndex, field: field.name, message: `値 ${value} が平均 ${mean.toFixed(1)} から ${ar.warn_deviation} σ 以上外れています` });
            }
          }
        }
      }
    }
  });

  // 5-4: Circular reference detection (table-level, checked once)
  const cyclicFields = detectComputedCycles(fields);
  for (const fieldName of cyclicFields) {
    errors.push({
      table: table.table,
      recordIndex: -1,
      field: fieldName,
      message: `フィールド "${fieldName}" の式に循環参照があります`,
    });
  }

  // 5-3: Formula errors per record (skip when circular refs present to avoid noise)
  if (cyclicFields.length === 0) {
    table.records.forEach((record, recordIndex) => {
      const formulaErrors: Array<{ field: string; message: string }> = [];
      computeRecord(record, fields, opts.refTables, formulaErrors);
      for (const fe of formulaErrors) {
        errors.push({ table: table.table, recordIndex, field: fe.field, message: `式エラー: ${fe.message}` });
      }
    });
  }

  return { errors, warnings, valid: errors.length === 0 };
}

export function validateMultipleTables(
  tables: TableFile[],
  opts: {
    baseFields?: BaseFieldsConfig;
    enums?: EnumsConfig;
  } = {}
): ValidationResult {
  const refTables = new Map<string, TableFile>(tables.map((t) => [t.table, t]));
  const combined: ValidationResult = { errors: [], warnings: [], valid: true };

  for (const table of tables) {
    const result = validateTable(table, { ...opts, refTables });
    combined.errors.push(...result.errors);
    combined.warnings.push(...result.warnings);
  }
  combined.valid = combined.errors.length === 0;
  return combined;
}
