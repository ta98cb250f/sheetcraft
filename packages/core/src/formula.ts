import type { Record, Cell, TableFile } from './types.js';
import { isRichCell } from './types.js';

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

type EvalContext = {
  record: Record;
  refTables?: Map<string, TableFile>;
};

function getCellScalar(cell: Cell | Cell[] | undefined): unknown {
  if (cell === undefined || cell === null) return undefined;
  if (Array.isArray(cell)) return cell;
  if (isRichCell(cell)) return cell.value;
  return cell;
}

// ---- Tokenizer ----

type TokenType =
  | 'NUMBER' | 'STRING' | 'IDENT' | 'LPAREN' | 'RPAREN'
  | 'COMMA' | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'PERCENT'
  | 'EQ' | 'NEQ' | 'LT' | 'LE' | 'GT' | 'GE'
  | 'AND' | 'OR' | 'NOT' | 'EOF';

type Token = { type: TokenType; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let num = '';
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }
    if (ch === "'") {
      let str = '';
      i++;
      while (i < src.length && src[i] !== "'") str += src[i++];
      i++;
      tokens.push({ type: 'STRING', value: str });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < src.length && /[a-zA-Z0-9_<>]/.test(src[i])) id += src[i++];
      const upper = id.toUpperCase();
      if (upper === 'AND') tokens.push({ type: 'AND', value: id });
      else if (upper === 'OR') tokens.push({ type: 'OR', value: id });
      else if (upper === 'NOT') tokens.push({ type: 'NOT', value: id });
      else tokens.push({ type: 'IDENT', value: id });
      continue;
    }
    if (ch === '=' && src[i + 1] === '=') { tokens.push({ type: 'EQ', value: '==' }); i += 2; continue; }
    if (ch === '!' && src[i + 1] === '=') { tokens.push({ type: 'NEQ', value: '!=' }); i += 2; continue; }
    if (ch === '<' && src[i + 1] === '=') { tokens.push({ type: 'LE', value: '<=' }); i += 2; continue; }
    if (ch === '>' && src[i + 1] === '=') { tokens.push({ type: 'GE', value: '>=' }); i += 2; continue; }
    if (ch === '<') { tokens.push({ type: 'LT', value: '<' }); i++; continue; }
    if (ch === '>') { tokens.push({ type: 'GT', value: '>' }); i++; continue; }
    if (ch === '+') { tokens.push({ type: 'PLUS', value: '+' }); i++; continue; }
    if (ch === '-') { tokens.push({ type: 'MINUS', value: '-' }); i++; continue; }
    if (ch === '*') { tokens.push({ type: 'STAR', value: '*' }); i++; continue; }
    if (ch === '/') { tokens.push({ type: 'SLASH', value: '/' }); i++; continue; }
    if (ch === '%') { tokens.push({ type: 'PERCENT', value: '%' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ',' }); i++; continue; }
    throw new FormulaError(`Unexpected character: ${ch}`);
  }
  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ---- Recursive-descent parser / evaluator ----

class Parser {
  private tokens: Token[];
  private pos = 0;
  private ctx: EvalContext;

  constructor(tokens: Token[], ctx: EvalContext) {
    this.tokens = tokens;
    this.ctx = ctx;
  }

  private peek(): Token { return this.tokens[this.pos]; }
  private consume(): Token { return this.tokens[this.pos++]; }
  private expect(type: TokenType): Token {
    const t = this.consume();
    if (t.type !== type) throw new FormulaError(`Expected ${type}, got ${t.type} ("${t.value}")`);
    return t;
  }

  parse(): unknown {
    const v = this.parseOr();
    if (this.peek().type !== 'EOF') throw new FormulaError('Unexpected token after expression');
    return v;
  }

  private parseOr(): unknown {
    let left = this.parseAnd();
    while (this.peek().type === 'OR') {
      this.consume();
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): unknown {
    let left = this.parseNot();
    while (this.peek().type === 'AND') {
      this.consume();
      const right = this.parseNot();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseNot(): unknown {
    if (this.peek().type === 'NOT') {
      this.consume();
      return !Boolean(this.parseNot());
    }
    return this.parseComparison();
  }

  private parseComparison(): unknown {
    let left = this.parseAddSub();
    const t = this.peek();
    if (['EQ', 'NEQ', 'LT', 'LE', 'GT', 'GE'].includes(t.type)) {
      this.consume();
      const right = this.parseAddSub();
      switch (t.type) {
        case 'EQ': return left === right;
        case 'NEQ': return left !== right;
        case 'LT': return (left as number) < (right as number);
        case 'LE': return (left as number) <= (right as number);
        case 'GT': return (left as number) > (right as number);
        case 'GE': return (left as number) >= (right as number);
      }
    }
    return left;
  }

  private parseAddSub(): unknown {
    let left = this.parseMulDiv();
    while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      const op = this.consume().type;
      const right = this.parseMulDiv();
      left = op === 'PLUS'
        ? (left as number) + (right as number)
        : (left as number) - (right as number);
    }
    return left;
  }

  private parseMulDiv(): unknown {
    let left = this.parseUnary();
    while (['STAR', 'SLASH', 'PERCENT'].includes(this.peek().type)) {
      const op = this.consume().type;
      const right = this.parseUnary();
      if (op === 'STAR') left = (left as number) * (right as number);
      else if (op === 'SLASH') {
        if ((right as number) === 0) throw new FormulaError('Division by zero');
        left = (left as number) / (right as number);
      } else left = (left as number) % (right as number);
    }
    return left;
  }

  private parseUnary(): unknown {
    if (this.peek().type === 'MINUS') {
      this.consume();
      return -(this.parsePrimary() as number);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): unknown {
    const t = this.peek();
    if (t.type === 'NUMBER') { this.consume(); return parseFloat(t.value); }
    if (t.type === 'STRING') { this.consume(); return t.value; }
    if (t.type === 'LPAREN') {
      this.consume();
      const v = this.parseOr();
      this.expect('RPAREN');
      return v;
    }
    if (t.type === 'IDENT') {
      this.consume();
      if (this.peek().type === 'LPAREN') {
        return this.callFunction(t.value);
      }
      // Field reference
      const cell = this.ctx.record[t.value];
      return getCellScalar(cell as Cell | undefined);
    }
    throw new FormulaError(`Unexpected token: ${t.type} ("${t.value}")`);
  }

  private callFunction(name: string): unknown {
    this.expect('LPAREN');
    const args: unknown[] = [];
    if (this.peek().type !== 'RPAREN') {
      args.push(this.parseOr());
      while (this.peek().type === 'COMMA') {
        this.consume();
        args.push(this.parseOr());
      }
    }
    this.expect('RPAREN');

    const fn = name.toLowerCase();
    switch (fn) {
      case 'if': {
        if (args.length !== 3) throw new FormulaError('if() requires 3 arguments');
        return Boolean(args[0]) ? args[1] : args[2];
      }
      case 'sum': return (args as number[]).reduce((a, b) => a + b, 0);
      case 'avg': {
        const nums = args as number[];
        return nums.reduce((a, b) => a + b, 0) / nums.length;
      }
      case 'min': return Math.min(...(args as number[]));
      case 'max': return Math.max(...(args as number[]));
      case 'count': return args.length;
      case 'concat': return (args as string[]).join('');
      case 'length': {
        if (typeof args[0] === 'string') return (args[0] as string).length;
        if (Array.isArray(args[0])) return (args[0] as unknown[]).length;
        return 0;
      }
      case 'ref': {
        // ref(tableName, idList, column)
        if (args.length !== 3) throw new FormulaError('ref() requires 3 arguments');
        const [tableName, idList, column] = args as [string, unknown, string];
        if (!this.ctx.refTables) throw new FormulaError('ref() requires refTables context');
        const rt = this.ctx.refTables.get(tableName);
        if (!rt) throw new FormulaError(`Table "${tableName}" not found`);
        const ids = Array.isArray(idList) ? idList : [idList];
        return ids.map((id) => {
          const row = rt.records.find(
            (r) => getCellScalar(r['id'] as Cell | undefined) === id
          );
          return row ? getCellScalar(row[column] as Cell | undefined) : undefined;
        });
      }
      // Math functions
      case 'abs': {
        if (args.length !== 1) throw new FormulaError('abs() requires 1 argument');
        return Math.abs(args[0] as number);
      }
      case 'round': {
        if (args.length < 1 || args.length > 2) throw new FormulaError('round() requires 1 or 2 arguments');
        const decimals = args.length === 2 ? (args[1] as number) : 0;
        const factor = Math.pow(10, decimals);
        return Math.round((args[0] as number) * factor) / factor;
      }
      case 'floor': {
        if (args.length !== 1) throw new FormulaError('floor() requires 1 argument');
        return Math.floor(args[0] as number);
      }
      case 'ceil': {
        if (args.length !== 1) throw new FormulaError('ceil() requires 1 argument');
        return Math.ceil(args[0] as number);
      }
      case 'pow': {
        if (args.length !== 2) throw new FormulaError('pow() requires 2 arguments');
        return Math.pow(args[0] as number, args[1] as number);
      }
      case 'sqrt': {
        if (args.length !== 1) throw new FormulaError('sqrt() requires 1 argument');
        return Math.sqrt(args[0] as number);
      }
      // String functions
      case 'upper': {
        if (args.length !== 1) throw new FormulaError('upper() requires 1 argument');
        return String(args[0]).toUpperCase();
      }
      case 'lower': {
        if (args.length !== 1) throw new FormulaError('lower() requires 1 argument');
        return String(args[0]).toLowerCase();
      }
      case 'trim': {
        if (args.length !== 1) throw new FormulaError('trim() requires 1 argument');
        return String(args[0]).trim();
      }
      case 'substr': {
        if (args.length < 2 || args.length > 3) throw new FormulaError('substr() requires 2 or 3 arguments');
        const s = String(args[0]);
        const start = args[1] as number;
        return args.length === 3 ? s.slice(start, start + (args[2] as number)) : s.slice(start);
      }
      case 'replace': {
        if (args.length !== 3) throw new FormulaError('replace() requires 3 arguments');
        return String(args[0]).split(String(args[1])).join(String(args[2]));
      }
      // Type conversion
      case 'int': {
        if (args.length !== 1) throw new FormulaError('int() requires 1 argument');
        return Math.trunc(Number(args[0]));
      }
      case 'float': {
        if (args.length !== 1) throw new FormulaError('float() requires 1 argument');
        return Number(args[0]);
      }
      case 'str': {
        if (args.length !== 1) throw new FormulaError('str() requires 1 argument');
        return String(args[0]);
      }
      // Logic functions (function form)
      case 'and': {
        if (args.length === 0) throw new FormulaError('and() requires at least 1 argument');
        return args.every((a) => Boolean(a));
      }
      case 'or': {
        if (args.length === 0) throw new FormulaError('or() requires at least 1 argument');
        return args.some((a) => Boolean(a));
      }
      // List functions
      case 'contains': {
        if (args.length !== 2) throw new FormulaError('contains() requires 2 arguments');
        if (Array.isArray(args[0])) return (args[0] as unknown[]).includes(args[1]);
        if (typeof args[0] === 'string') return (args[0] as string).includes(String(args[1]));
        return false;
      }
      case 'size': {
        if (args.length !== 1) throw new FormulaError('size() requires 1 argument');
        if (Array.isArray(args[0])) return (args[0] as unknown[]).length;
        if (typeof args[0] === 'string') return (args[0] as string).length;
        return 0;
      }
      default:
        throw new FormulaError(`Unknown function: ${name}`);
    }
  }
}

export function evaluate(
  formula: string,
  record: Record,
  refTables?: Map<string, TableFile>
): unknown {
  const tokens = tokenize(formula);
  const parser = new Parser(tokens, { record, refTables });
  return parser.parse();
}

export function detectComputedCycles(fields: import('./types.js').FieldDef[]): string[] {
  const computedNames = new Set(
    fields.filter((f) => f.type === 'computed').map((f) => f.name)
  );
  if (computedNames.size === 0) return [];

  const namePatterns = new Map<string, RegExp>();
  for (const cf of computedNames) namePatterns.set(cf, new RegExp(`\\b${cf}\\b`));

  const deps = new Map<string, Set<string>>();
  for (const f of fields) {
    if (f.type !== 'computed') continue;
    const formula = f.formula ?? '';
    const fieldDeps = new Set<string>();
    for (const cf of computedNames) {
      if (namePatterns.get(cf)!.test(formula)) fieldDeps.add(cf);
    }
    deps.set(f.name, fieldDeps);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cyclic = new Set<string>();

  function dfs(name: string) {
    visited.add(name);
    inStack.add(name);
    for (const dep of deps.get(name) ?? []) {
      if (!visited.has(dep)) dfs(dep);
      if (inStack.has(dep)) { cyclic.add(dep); cyclic.add(name); }
    }
    inStack.delete(name);
  }
  for (const name of deps.keys()) {
    if (!visited.has(name)) dfs(name);
  }
  return [...cyclic];
}

export function computeRecord(
  record: Record,
  fields: import('./types.js').FieldDef[],
  refTables?: Map<string, TableFile>,
  formulaErrors?: Array<{ field: string; message: string }>
): Record {
  const result: Record = { ...record };
  for (const field of fields) {
    if (field.type !== 'computed') continue;
    const cell = record[field.name];
    if (isRichCell(cell as Cell)) {
      const rich = cell as import('./types.js').RichCell;
      if (rich.value !== undefined) { result[field.name] = rich.value; continue; }
      if (rich.override) {
        try {
          result[field.name] = evaluate(rich.override, result, refTables) as import('./types.js').SimpleCell;
        } catch (e) {
          if (e instanceof FormulaError) {
            if (formulaErrors) formulaErrors.push({ field: field.name, message: e.message });
          } else {
            console.warn(`Unexpected error evaluating override for "${field.name}":`, e);
          }
        }
        continue;
      }
    }
    if (field.formula) {
      try {
        result[field.name] = evaluate(field.formula, result, refTables) as import('./types.js').SimpleCell;
      } catch (e) {
        if (e instanceof FormulaError) {
          if (formulaErrors) formulaErrors.push({ field: field.name, message: e.message });
        } else {
          console.warn(`Unexpected error evaluating formula "${field.formula}":`, e);
        }
      }
    }
  }
  return result;
}
