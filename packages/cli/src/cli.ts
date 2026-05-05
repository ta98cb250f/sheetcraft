#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import {
  parseTableFile,
  parseEnumsConfig,
  parseBaseFieldsConfig,
  validateMultipleTables,
  exportToJSON,
  exportToCSV,
} from '@sheetcraft/core';
import type { TableFile, EnumsConfig, BaseFieldsConfig } from '@sheetcraft/core';

const [, , command, ...args] = process.argv;

async function loadMasterDir(dir: string): Promise<{
  tables: TableFile[];
  enums: EnumsConfig | null;
  baseFields: BaseFieldsConfig | null;
}> {
  const files = await readdir(dir);
  const tables: TableFile[] = [];
  let enums: EnumsConfig | null = null;
  let baseFields: BaseFieldsConfig | null = null;

  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const text = await readFile(join(dir, file), 'utf-8');
    const json = JSON.parse(text) as unknown;
    if (file === 'enums.json') { enums = parseEnumsConfig(json); continue; }
    if (file === 'base_fields.json') { baseFields = parseBaseFieldsConfig(json); continue; }
    if (file === 'cell_colors.json' || file === 'project.json') continue;
    try { tables.push(parseTableFile(json)); } catch { /* skip */ }
  }
  return { tables, enums, baseFields };
}

async function cmdValidate(masterDir: string): Promise<void> {
  const dir = resolve(masterDir);
  const { tables, enums, baseFields } = await loadMasterDir(dir);
  const result = validateMultipleTables(tables, { enums: enums ?? undefined, baseFields: baseFields ?? undefined });

  if (result.valid) {
    console.log(`✓ バリデーション成功（${tables.length} テーブル, エラーなし）`);
    if (result.warnings.length > 0) {
      console.warn(`  警告: ${result.warnings.length} 件`);
      for (const w of result.warnings) {
        console.warn(`  [WARNING] ${w.table} 行${w.recordIndex + 1} ${w.field}: ${w.message}`);
      }
    }
    process.exit(0);
  } else {
    console.error(`✗ バリデーション失敗: ${result.errors.length} 件のエラー`);
    for (const e of result.errors) {
      console.error(`  [ERROR] ${e.table} 行${e.recordIndex + 1} ${e.field}: ${e.message}`);
    }
    if (result.warnings.length > 0) {
      console.warn(`  警告: ${result.warnings.length} 件`);
    }
    process.exit(1);
  }
}

async function cmdExport(masterDir: string, format: string, outDir: string): Promise<void> {
  const dir = resolve(masterDir);
  const out = resolve(outDir);
  await mkdir(out, { recursive: true });

  const { tables, enums: _enums, baseFields } = await loadMasterDir(dir);

  for (const table of tables) {
    const refTables = new Map(tables.map((t) => [t.table, t]));
    let content: string;
    let ext: string;

    if (format === 'json') {
      content = exportToJSON(table, { baseFields: baseFields ?? undefined, refTables, pretty: true });
      ext = 'json';
    } else if (format === 'csv') {
      content = exportToCSV(table, { baseFields: baseFields ?? undefined, refTables });
      ext = 'csv';
    } else {
      console.error(`未対応フォーマット: ${format}（対応: json, csv）`);
      process.exit(1);
    }

    const outFile = join(out, `${table.table}.${ext}`);
    await writeFile(outFile, content, 'utf-8');
    console.log(`  出力: ${outFile}`);
  }
  console.log(`✓ エクスポート完了（${tables.length} テーブル → ${format}）`);
}

const NEW_TABLE_TEMPLATE = (name: string) => JSON.stringify({
  table: name,
  display_name: name,
  fields: [
    { name: 'name', type: 'string', display_name: '名前', required: true, export: true },
  ],
  records: [],
}, null, 2);

async function cmdNew(masterDir: string, tableName: string): Promise<void> {
  const dir = resolve(masterDir);
  const outFile = join(dir, `${tableName}.json`);
  await writeFile(outFile, NEW_TABLE_TEMPLATE(tableName), 'utf-8');
  console.log(`✓ テーブル作成: ${outFile}`);
}

function parseFlag(args: string[], flag: string, defaultValue: string): string {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

async function main() {
  switch (command) {
    case 'validate': {
      if (!args[0]) { console.error('使い方: masterdata-tool validate <master-dir>'); process.exit(1); }
      await cmdValidate(args[0]);
      break;
    }
    case 'export': {
      if (!args[0]) { console.error('使い方: masterdata-tool export <master-dir> -f <format> -o <out-dir>'); process.exit(1); }
      const format = parseFlag(args, '-f', 'json');
      const outDir = parseFlag(args, '-o', './build');
      await cmdExport(args[0], format, outDir);
      break;
    }
    case 'new': {
      if (!args[0] || !args[1]) { console.error('使い方: masterdata-tool new <master-dir> <table-name>'); process.exit(1); }
      await cmdNew(args[0], args[1]);
      break;
    }
    default:
      console.log(`
masterdata-tool — マスターデータ管理ツール

コマンド:
  validate <dir>                      バリデーション（CIで使用）
  export <dir> -f <fmt> -o <out-dir>  エクスポート（json | csv）
  new <dir> <table-name>              テーブル新規作成
`);
      process.exit(0);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
