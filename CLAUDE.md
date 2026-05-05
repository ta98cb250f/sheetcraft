# SheetCraft — Claude Code ガイド

ゲーム開発向けマスターデータ管理ツール。ブラウザSPA（React + AG Grid）＋ CLIの npm workspaces モノレポ。

## リポジトリ構成

```
packages/
  core/   型定義・バリデーション・数式エンジン（GUI/CLI共有）
  gui/    React SPA（AG Grid、File System Access API）
  cli/    CLI（バリデーション・エクスポート）
example/  サンプルマスターデータ（JSON）
ISSUES.md 既知課題・未実装一覧（優先度付き）
DESIGN.md 設計書
```

## よく使うコマンド

```bash
# ビルド（型チェック含む）
npm run build -w packages/core
npm run build -w packages/gui

# テスト
npm test -w packages/core

# GUI 開発サーバー
npm run dev -w packages/gui
```

## コアデータモデル

- **`Cell`** = `SimpleCell | RichCell`
  - `SimpleCell`: `number | string | boolean`
  - `RichCell`: `{ value?, override?, color?, comment? }` — セルに色・コメント・式オーバーライドを付加
  - `isRichCell(cell)` で判定
- **`TableFile`**: `{ table, display_name, fields, records }` — 1ファイル = 1テーブル
- **`FieldDef`**: `type` は `int | float | string | bool | enum | list<int> | list<string> | computed`
  - `computed` フィールドは `formula` で計算式を指定。`RichCell.override` で個別上書き可能
  - `auto: "increment"` で id 自動採番

## GUI 設計

- **`useProject`**: フォルダ開閉（File System Access API）、テーブル読込・保存、IndexedDB でフォルダ記憶
- **`TableView`**: AG Grid Community。行追加/削除、インライン編集、コピー&ペースト（TSV）、Undo/Redo
  - `rowData` には `_idx`（元レコードの配列インデックス）を持たせ、ソート後も正しいレコードを参照
  - `cellRenderer` でコメント付きセルに三角マーカー表示
  - 右クリックメニューから色・コメント設定が可能
- **Undo/Redo**: `historyRef / futureRef` に `TableFile` のスナップショットを保存（最大50件）
- **バリデーション**: 編集後 300ms debounce で自動実行。エラー/警告をセルに色付け、ツールバーにバッジ表示

## 重要な注意事項

- **AG Grid Community** を使用。`enableRangeSelection`（範囲選択クリップボード）は Enterprise 機能のため未使用
- `rowData` はソート/フィルタ後も `_idx` で元レコードを引けるように設計
- `colDefs` の `cellStyle` は全プロパティを明示的に返すこと（`undefined` は AG Grid の型制約違反になる）
- `Record` は JS 組み込み型と衝突するため、core からのインポートは `MasterRecord` にエイリアス
- `FileSystemDirectoryHandle.queryPermission` / `requestPermission` は TypeScript の標準型に未定義のため、`FileBackend.ts` でグローバル宣言で拡張している

## 開発ブランチ

変更は `claude/confirm-goals-prB4D` ブランチで行い、コミット後 `git push -u origin claude/confirm-goals-prB4D` でプッシュ。
