import { parseTableFile, SchemaError } from '../schema.js';

describe('parseTableFile', () => {
  const validTable = {
    table: 'character_master',
    display_name: 'キャラクター',
    fields: [
      { name: 'name', type: 'string', display_name: '名前', required: true, export: true },
      { name: 'hp', type: 'int', display_name: 'HP', export: true, validation: { min: 1, max: 99999 } },
      { name: 'rarity', type: 'enum', display_name: 'レアリティ', enum_ref: 'rarity', export: true },
      { name: 'effective_hp', type: 'computed', display_name: '実効HP', formula: 'hp * (1 + defense / 100)', export: true },
    ],
    records: [{ id: 1, name: '勇者アルス', hp: 1200 }],
  };

  it('parses a valid table file', () => {
    const result = parseTableFile(validTable);
    expect(result.table).toBe('character_master');
    expect(result.fields).toHaveLength(4);
    expect(result.records).toHaveLength(1);
  });

  it('throws on missing table name', () => {
    expect(() => parseTableFile({ ...validTable, table: '' })).toThrow(SchemaError);
  });

  it('throws on invalid field type', () => {
    const bad = { ...validTable, fields: [{ name: 'x', type: 'unknown' }] };
    expect(() => parseTableFile(bad)).toThrow(SchemaError);
  });

  it('throws on duplicate field names', () => {
    const dup = {
      ...validTable,
      fields: [
        { name: 'hp', type: 'int' },
        { name: 'hp', type: 'int' },
      ],
    };
    expect(() => parseTableFile(dup)).toThrow(SchemaError);
  });

  it('throws on enum field without enum_ref', () => {
    const bad = { ...validTable, fields: [{ name: 'r', type: 'enum' }] };
    expect(() => parseTableFile(bad)).toThrow(SchemaError);
  });

  it('throws on computed field without formula', () => {
    const bad = { ...validTable, fields: [{ name: 'c', type: 'computed' }] };
    expect(() => parseTableFile(bad)).toThrow(SchemaError);
  });
});
