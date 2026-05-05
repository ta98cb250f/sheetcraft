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
  - `rowData` には `_idx`（元レコードの配列インデックス）と `_errFields`/`_warnFields` を持たせ、ソート/フィルタ後も正しいレコードを参照
  - `tableRecordsRef`（useRef）で `cellRenderer` 内から常に最新の records を参照する（stale closure 対策）
  - `cellRenderer` でコメント付きセルに三角マーカー表示
  - 右クリックメニューは `onCellContextMenu` + カスタム `ContextMenu` コンポーネントで実装（`getContextMenuItems` は Enterprise 機能のため未使用）
  - `isFieldEditable(field)` で編集可否を一元判定（colDefs・handlePaste・handleKeyDown・handleSearchReplace・handleCellUpdate・readonly プロップで共用）
- **Undo/Redo**: `historyRef / futureRef` に `TableFile` のスナップショットを保存（最大50件）
- **バリデーション**: 編集後 300ms debounce で自動実行。エラー/警告をセルに色付け、ツールバーにバッジ表示

## 重要な注意事項

- **AG Grid Community** を使用。`enableRangeSelection`（範囲選択クリップボード）は Enterprise 機能のため未使用
- `rowData` はソート/フィルタ後も `_idx` で元レコードを引けるように設計
- `colDefs` の `cellStyle` は全プロパティを明示的に返すこと（`undefined` は AG Grid の型制約違反になる）
- `Record` は JS 組み込み型と衝突するため、core からのインポートは `MasterRecord` にエイリアス
- `FileSystemDirectoryHandle.queryPermission` / `requestPermission` は TypeScript の標準型に未定義のため、`FileBackend.ts` でグローバル宣言で拡張している

## 実装方針

コードを変更する前に、以下を必ず確認すること：

1. **対象APIの仕様を調べる** — イベントがどのユーザー操作で発火するか、他のイベントと連鎖するかを把握する
2. **影響範囲を列挙する** — 変更が既存機能（他のイベントハンドラ、キーボード操作、選択状態など）に波及しないか確認する
3. **根拠を持って実装する** — 「たぶん動く」で変更しない。不明点はコードを読む・ドキュメントを参照する

## AG Grid イベント設計ルール（エンバグ防止）

AG Grid のイベントは複数が連鎖して発火するため、1つのイベントハンドラに複数の責務を持たせると意図しない副作用が起きやすい。

| イベント | 発火タイミング | 責務 |
|---|---|---|
| `onCellFocused` | マウスクリック・キーボード移動すべて | 詳細パネル同期（`selectedRow`/`selectedField` 更新）のみ |
| `onCellClicked` | マウスクリックのみ | 行選択解除など「クリック起点」の副作用 |
| `onSelectionChanged` | チェックボックス操作・`selectAll`/`deselectAll` | 行選択状態の読み取り |

**チェックボックス判定**: `onCellClicked` でチェックボックスを除外するときは `(e.event?.target as HTMLInputElement)?.type === 'checkbox'` で判定する。

**`deselectAll()` の置き場所**: `onCellFocused` に置くとチェックボックスクリックでも発火して多重選択が壊れる。必ず `onCellClicked` 側に置き、`type === 'checkbox'` のときはスキップする。

**`cellStyle` の `null` 返却禁止**: AG Grid は `null` を返してもインラインスタイルをクリアしない。スタイルリセットは `{ border: '', background: '', color: 'inherit', fontStyle: 'normal' }` のように全プロパティを明示する。

**`colDefs` の `cellStyle` でクロージャを使わない**: バリデーション結果など変化するデータを `cellStyle` のクロージャでキャプチャすると「1操作遅れ」になる。代わりに `rowData` に `_errFields`/`_warnFields` として埋め込み、`params.data` から読む。変化後は `refreshCells({ force: true })` を呼ぶ。

**`getRowId` を設定する**: `rowData` が差し替わると AG Grid は行選択をリセットする。`getRowId={(params) => String(params.data._idx)}` を設定することでデータ更新後も選択状態が維持される。

**イベントハンドラの接続先**: `onKeyDown`/`onPaste` はグリッドのルート要素（`.ag-theme-alpine` div）に付ける。親コンテナに付けると詳細パネル等の兄弟要素のイベントも拾ってしまう。INPUT タグガードは `type !== 'checkbox'` を除外すること（チェックボックスは `<input type="checkbox">`）。

**フィルタ可視行のみを対象にする**: Ctrl+C・Ctrl+D など選択行を操作する処理は `getSelectedRows()` ではなく `forEachNodeAfterFilterAndSort` + `node.isSelected()` を使う。`getSelectedRows()` はフィルタ非表示行も返す。

**ペースト時の行解決**: `focusedCell.rowIndex` は表示上のインデックスであり、レコード配列インデックスではない。ペースト先の行は `getDisplayedRowAtIndex(displayIdx)?.data._idx` で解決する。

**`headerCheckboxSelectionFilteredOnly`**: ヘッダーチェックボックスでフィルタ可視行のみ選択するには colDef に `headerCheckboxSelectionFilteredOnly: true` を設定する。

## 開発ブランチ

変更は `feature/gitignore-skill-fixes` ブランチで行い、コミット後 `git push -u origin feature/gitignore-skill-fixes` でプッシュ。
