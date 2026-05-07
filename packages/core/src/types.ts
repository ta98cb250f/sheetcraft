// ---- Cell types ----

export type SimpleCell = number | string | boolean;

export type RichCell = {
  value?: number | string | boolean;
  override?: string; // formula override (computed fields only)
  color?: string;
  comment?: string;
};

export type Cell = SimpleCell | RichCell;

export function isRichCell(cell: Cell): cell is RichCell {
  return typeof cell === 'object' && cell !== null;
}

// ---- Validation / Anomaly ----

export type ValidationRule = {
  required?: boolean;
  min?: number;
  max?: number;
  max_length?: number;
  regex?: string;
  unique?: boolean;
  ref_exists?: boolean;
};

export type AnomalyRule = {
  warn_above?: number;
  warn_below?: number;
  warn_deviation?: number;
  warn_delta?: number;
};

// ---- Field types ----

export type FieldType =
  | 'int'
  | 'float'
  | 'string'
  | 'bool'
  | 'enum'
  | 'list<int>'
  | 'list<string>';

export type FieldDef = {
  name: string;
  type: FieldType;
  display_name?: string;
  required?: boolean;
  export?: boolean;
  editable?: boolean;
  auto?: 'increment' | 'timestamp_version';
  primary?: boolean;
  // enum
  enum_ref?: string;
  // ref
  ref?: string; // e.g. "skill_master.id"
  // 列レベルのデフォルト式（任意の型で使用可能。セルに値や override がない場合に評価される）
  formula?: string;
  // validation
  validation?: ValidationRule;
  anomaly?: AnomalyRule;
};

// ---- Base fields ----

export type BaseFieldDef = FieldDef & {
  auto: 'increment' | 'timestamp_version';
};

// ---- Table ----

export type Record = { [field: string]: Cell | Cell[] | undefined };

export type TableFile = {
  table: string;
  display_name?: string;
  fields: FieldDef[];
  records: Record[];
};

// ---- Config files ----

export type EnumDef = {
  display_name?: string;
  values: string[];
};

export type EnumsConfig = {
  enums: { [name: string]: EnumDef };
};

export type CellColorDef = {
  hex: string;
  label?: string;
};

export type CellColorsConfig = {
  cell_colors: { [key: string]: CellColorDef };
};

export type BaseFieldsConfig = {
  base_fields: BaseFieldDef[];
};

export type OutputFormat = 'json' | 'protobuf' | 'csv' | 'messagepack';

export type ProjectConfig = {
  output: {
    format: OutputFormat;
    options?: Record;
    out_dir?: string;
  };
};

// ---- Validation results ----

export type ValidationError = {
  table: string;
  recordIndex: number;
  field: string;
  message: string;
};

export type AnomalyWarning = {
  table: string;
  recordIndex: number;
  field: string;
  message: string;
};

export type ValidationResult = {
  errors: ValidationError[];
  warnings: AnomalyWarning[];
  valid: boolean;
};
