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

## GitHub CLI（gh）

`gh` コマンド（v2.45.0）が `/usr/bin/gh` に存在し、`GH_TOKEN` 環境変数で認証済み（アカウント: `ta98cb250f`）。
GitHub の操作（Issue・PR・マイルストーン確認など）は `gh` コマンドで行える。

**注意**: git remote がローカルプロキシ経由のため、リポジトリ操作には必ず `--repo` フラグを付けること。

```bash
# マイルストーン一覧
gh api repos/ta98cb250f/sheetcraft/milestones

# Issue 一覧
gh issue list --repo ta98cb250f/sheetcraft

# PR 一覧
gh pr list --repo ta98cb250f/sheetcraft

# ラベル一覧
gh label list --repo ta98cb250f/sheetcraft
```

**注意**: `gh pr edit` は Projects classic の deprecation エラーで失敗する。PR の更新には `gh api` を使うこと。

```bash
# PR 本文の更新
gh api repos/ta98cb250f/sheetcraft/pulls/<番号> --method PATCH --field body="..."
```

## コアデータモデル

- **`Cell`** = `SimpleCell | RichCell`
  - `SimpleCell`: `number | string | boolean`
  - `RichCell`: `{ value?, override?, color?, comment? }` — セルに色・コメント・式オーバーライドを付加
  - `isRichCell(cell)` で判定
- **`TableFile`**: `{ table, display_name, fields, records }` — 1ファイル = 1テーブル
- **`FieldDef`**: `type` は `int | float | string | bool | enum | list<int> | list<string>`
  - 任意の非 enum フィールドは `formula` で列レベルのデフォルト式を指定可能。優先順位: セル値 > セルの `=` 式（`RichCell.override`）> 列の `formula`
  - `auto: "increment"` で id 自動採番
- **`TableFile.column_widths`**: `{ [fieldName]: number }` 形式の列幅マップ。`base_fields` と `table.fields` の両方を統一管理

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

## よくある介入パターン（着手前に必ず照合する）

過去の介入ログ（`.claude/notes/intervention-log.md`）から再発上位 5 件。新規作業に入る前に、自分の次の行動がこれらに該当しないか確認する。

1. **メモリへの書き込みは事前確認必須** — `~/.claude/projects/.../memory/` への Write / Edit は、内容と保存可否をユーザーに先に提示してから実行する（3 回再発）
2. **造語・略語・カタカナ語の精度** — 「HMR」「型タグ」「コミュ」「placement / placeholder」等。技術用語は正式名で書く。独自造語禁止。曖昧な語は最初に定義する（複数回再発）
3. **UI 配置指示は `/find-component` を先に通す** — 「ヘッダーに」「列に」「モーダルに」等の場所指示は、対象コンポーネントの特定が先。思い込み実装で 4 回手戻りした実績あり
4. **「実装した」は動作確認後にしか言わない** — 実機で動かしていないなら「コードは書いたが未検証」と明示する。Delete キーで 3 回手戻り、Shift+クリックも疑念視された
5. **`Edit` の `replace_all` 前に grep で全箇所を確認** — 前方一致が衝突すると二重置換になる（「コミュニケーションニケーション」事例）。`replace_all: true` を使う前に必ず該当文字列の全箇所を確認する

## 実装方針

### 着手宣言（コード変更の直前に必ず出す）

Edit / Write を呼ぶ前に、以下 5 点を 1 メッセージで提示してからツール実行に入る。

1. **対象**: 編集するファイル / コンポーネント（UI 配置指示は `/find-component` で確認した結果）
2. **API / 仕様**: 関連イベント・型・データモデル（AG Grid は `/check-agrid-community` 結果も）
3. **影響範囲**: 連鎖する他のハンドラ・状態・既存機能・他テーブル / レコード
4. **根拠**: なぜこの方針か。「たぶん動く」「動くはず」は禁止。不明点はコードを読む / ドキュメントを参照する
5. **検証手順**: 何をどう確認すれば「動いた」と言えるか（実機操作・grep・型チェック・テストのいずれか具体的に）

省略可なのは「1 ファイル・タイポ・コメント修正」のみ。省略する場合は「着手宣言省略：理由」を 1 行で出す。

「進めて」「やって」「お願い」など範囲の広い指示を受けたときは、着手宣言の前に **最小 1 ステップに区切ってユーザーに確認** する。複数論点を 1 度に走らせない。

### 既存サブルール

- **UI 変更の対象コンポーネントを特定してから実装する** — 「ヘッダーに出す」「列に出す」など場所を示す指示は、`/find-component` で対象ファイル・コンポーネントを確認してから編集する。思い込みで実装しない
- **AG Grid の機能は Community 版で使えるか事前に確認する** — `/check-agrid-community <機能名>` で Enterprise 参照の有無を確認してから実装する

## 人的介入ログ

Claude Code が単体で完結できる範囲を広げるため、ユーザーが指摘・修正・誘導した事象を `.claude/notes/intervention-log.md` に蓄積している。

- **書き方・運用**: 同ファイルの「方針」セクションを参照
- **追記タイミング**: PR 作成時 or セッション末。明示指示が無くても該当作業が発生したら `/intervention-log` を発火させる
- **読むタイミング**: 似た領域の作業を始める前に該当カテゴリ・領域のログを参照し、既知の落とし穴を回避する
- **昇格**: 同種の介入が複数回出ているパターンは CLAUDE.md / スキル / メモリ に昇格させる（昇格後はログ側に `→ 反映先` を注記）

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

PR を作成する前に `gh api repos/ta98cb250f/sheetcraft --jq '.default_branch'` でデフォルトブランチを確認し、マージ先に使うこと。
