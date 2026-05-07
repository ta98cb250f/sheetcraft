import { evaluate, computeRecord } from '../formula.js';
import type { Record } from '../types.js';

describe('evaluate', () => {
  const record: Record = { hp: 1200, defense: 50, rarity: 'SSR', flag: true };

  it('evaluates arithmetic', () => {
    expect(evaluate('hp * (1 + defense / 100)', record)).toBeCloseTo(1800);
  });

  it('evaluates comparison', () => {
    expect(evaluate("rarity == 'SSR'", record)).toBe(true);
    expect(evaluate('hp > 1000', record)).toBe(true);
    expect(evaluate('hp < 1000', record)).toBe(false);
  });

  it('evaluates if()', () => {
    expect(evaluate("if(rarity == 'SSR', 0.03, 0.10)", record)).toBe(0.03);
    expect(evaluate("if(rarity == 'R', 0.03, 0.10)", record)).toBe(0.10);
  });

  it('evaluates sum()', () => {
    expect(evaluate('sum(1, 2, 3)', record)).toBe(6);
  });

  it('evaluates min/max/avg', () => {
    expect(evaluate('min(hp, defense)', record)).toBe(50);
    expect(evaluate('max(hp, defense)', record)).toBe(1200);
    expect(evaluate('avg(100, 200, 300)', record)).toBe(200);
  });

  it('evaluates concat/length', () => {
    expect(evaluate("concat('Hello', ' ', 'World')", record)).toBe('Hello World');
    expect(evaluate("length('abc')", record)).toBe(3);
  });

  it('evaluates AND / OR / NOT', () => {
    expect(evaluate('hp > 1000 AND defense > 10', record)).toBe(true);
    expect(evaluate('hp > 2000 OR defense > 10', record)).toBe(true);
    expect(evaluate('NOT flag', record)).toBe(false);
  });

  it('throws on division by zero', () => {
    expect(() => evaluate('hp / 0', record)).toThrow();
  });

  it('throws on unknown function', () => {
    expect(() => evaluate('unknown(1)', record)).toThrow();
  });
});

describe('computeRecord', () => {
  it('applies formula to computed field', () => {
    const record: Record = { hp: 1000, defense: 100 };
    const fields = [
      { name: 'hp', type: 'int' as const, export: true },
      { name: 'defense', type: 'int' as const, export: true },
      { name: 'effective_hp', type: 'float' as const, formula: 'hp * (1 + defense / 100)', export: true },
    ];
    const result = computeRecord(record, fields);
    expect(result['effective_hp']).toBeCloseTo(2000);
  });

  it('respects override in RichCell', () => {
    const record: Record = { hp: 1000, effective_hp: { override: 'hp * 2' } };
    const fields = [
      { name: 'hp', type: 'int' as const, export: true },
      { name: 'effective_hp', type: 'float' as const, formula: 'hp * 1', export: true },
    ];
    const result = computeRecord(record, fields);
    expect(result['effective_hp']).toBe(2000);
  });

  it('respects fixed value in RichCell', () => {
    const record: Record = { hp: 1000, effective_hp: { value: 9999 } };
    const fields = [
      { name: 'hp', type: 'int' as const, export: true },
      { name: 'effective_hp', type: 'float' as const, formula: 'hp * 1', export: true },
    ];
    const result = computeRecord(record, fields);
    expect(result['effective_hp']).toBe(9999);
  });
});
