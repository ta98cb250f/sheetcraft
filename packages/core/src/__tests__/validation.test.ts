import { validateTable } from '../validation.js';
import type { TableFile, EnumsConfig } from '../types.js';

const enums: EnumsConfig = {
  enums: {
    rarity: { values: ['N', 'R', 'SR', 'SSR'] },
  },
};

const baseTable: TableFile = {
  table: 'character_master',
  fields: [
    { name: 'name', type: 'string', export: true, validation: { required: true, max_length: 10, unique: true } },
    { name: 'hp', type: 'int', export: true, validation: { min: 1, max: 99999 }, anomaly: { warn_above: 10000 } },
    { name: 'rarity', type: 'enum', enum_ref: 'rarity', export: true },
  ],
  records: [],
};

describe('validateTable', () => {
  it('passes valid records', () => {
    const table: TableFile = {
      ...baseTable,
      records: [
        { name: 'アルス', hp: 1200, rarity: 'SSR' },
      ],
    };
    const result = validateTable(table, { enums });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports required error', () => {
    const table: TableFile = {
      ...baseTable,
      records: [{ hp: 1200, rarity: 'SSR' }],
    };
    const result = validateTable(table, { enums });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'name' && e.message.includes('必須'))).toBe(true);
  });

  it('reports min/max error', () => {
    const table: TableFile = {
      ...baseTable,
      records: [{ name: 'X', hp: 0, rarity: 'N' }],
    };
    const result = validateTable(table, { enums });
    expect(result.errors.some((e) => e.field === 'hp')).toBe(true);
  });

  it('reports max_length error', () => {
    const table: TableFile = {
      ...baseTable,
      records: [{ name: '12345678901', hp: 100, rarity: 'N' }],
    };
    const result = validateTable(table, { enums });
    expect(result.errors.some((e) => e.field === 'name' && e.message.includes('文字数'))).toBe(true);
  });

  it('reports unique error', () => {
    const table: TableFile = {
      ...baseTable,
      records: [
        { name: 'dup', hp: 100, rarity: 'N' },
        { name: 'dup', hp: 200, rarity: 'R' },
      ],
    };
    const result = validateTable(table, { enums });
    expect(result.errors.some((e) => e.field === 'name' && e.message.includes('重複'))).toBe(true);
  });

  it('reports invalid enum value', () => {
    const table: TableFile = {
      ...baseTable,
      records: [{ name: 'X', hp: 100, rarity: 'LEGEND' }],
    };
    const result = validateTable(table, { enums });
    expect(result.errors.some((e) => e.field === 'rarity')).toBe(true);
  });

  it('reports anomaly warning', () => {
    const table: TableFile = {
      ...baseTable,
      records: [{ name: 'X', hp: 99999, rarity: 'SSR' }],
    };
    const result = validateTable(table, { enums });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.field === 'hp')).toBe(true);
  });
});
