# GUI ライブラリ移行検討レポート

`packages/gui` を AG Grid Community から別ライブラリへ移行（または作り直し）するかを判断するための実装棚卸し・要件抽出・候補比較。
コードは 2026-05-19 時点の `claude/gui-library-migration-A958A` ブランチを参照。

---

## 1. 現状の AG Grid 依存箇所の棚卸し

`packages/gui/src/components/TableView.tsx` が 1433 行と非常に肥大化しており、AG Grid Community の制約を回避するためのカスタム実装が多数含まれている。以下、A / B / C に分類する。

### A. どのテーブル / グリッドライブラリでも必要な機能

| 機能 | 主な依存 API | 該当箇所 |
|---|---|---|
| 行仮想スクロール | `AgGridReact` の標準 | `TableView.tsx:1304` |
| 列幅 / 列順 / 列固定の永続化 | `column_widths`、`pinned: 'left'` | `TableView.tsx:540-554`、`onColumnMoved` `onColumnResized` (1127-1155) |
| ソート | `column.getSort()`、`progressSort` | `ColumnHeader` (167-274) |
| フィルタ | `filter: true`、`getFilterModel/setFilterModel` | `TableView.tsx:477`、`onFilterChanged` (1323) |
| インライン編集 | `editable: true`、`cellEditorSelector` | `TableView.tsx:488-499`、`onCellValueChanged` (608-635) |
| 行選択（複数） | `rowSelection="multiple"`、`checkboxSelection: i === 0` | `TableView.tsx:553, 1313-1314` |
| 行ドラッグ並び替え | `rowDragManaged`、`onRowDragEnd` | `TableView.tsx:1158-1171, 1315-1316` |
| セルレンダラ | `cellRenderer` (`CommentCellRenderer`) | `TableView.tsx:501-535` |
| セルスタイル（エラー / 警告 / 色） | `cellStyle` | `TableView.tsx:571-602` |
| 行 ID 維持 | `getRowId` | `TableView.tsx:1307` |
| TSV クリップボード | ブラウザ標準 `navigator.clipboard` | `handlePaste` (767-845)、`handleKeyDown` (849-939) |
| Undo / Redo | `historyRef / futureRef` スナップショット | `App.tsx:9, 27-28, 64-94` |
| ファイルアクセス | File System Access API（AG Grid 非依存） | `backend/FileBackend.ts`、`hooks/useProject.ts` |

これらは候補ライブラリのどれを選んでも同等機能が必要。

### B. AG Grid に合わせるために書いた機能（移行で消える / 形を変える）

| # | 内容 | 該当箇所 | 性質 |
|---|---|---|---|
| B-1 | **AG Grid 内部 DOM 属性 `col-id` / `row-index` を直接パースして座標解決** | `cellPosFromTarget` `TableView.tsx:359-373` | AG Grid 内部実装に依存。バージョン更新で壊れる可能性 |
| B-2 | **範囲選択をゼロから自作**（mousedown / mousemove / mouseup を `window` に張る） | `handleGridMouseDown` `TableView.tsx:654-712` | `enableRangeSelection` が Enterprise のため代替 |
| B-3 | **Delete / Backspace を capture phase で奪う** native listener | `useEffect` `TableView.tsx:1213-1278` | AG Grid のデフォルト（編集モード開始）が範囲削除と衝突するため |
| B-4 | **コンテキストメニュー自前実装**（`suppressContextMenu` + `onCellContextMenu` + `ContextMenu.tsx`） | `ContextMenu.tsx` 全体、`TableView.tsx:1003-1124, 1319-1320, 1342-1349` | `getContextMenuItems` が Enterprise のため代替 |
| B-5 | **カラムヘッダーチェックボックスを自前実装**（`headerCheckboxSelection` の代替） | `ColumnHeader` `TableView.tsx:167-274` (特に 183-220) | `headerCheckboxSelection` 自体は Community にあるが、選択状態と filter 連動の細かい制御のため自作 |
| B-6 | **`cellStyle` 全プロパティ明示返却**（`null` 返却で塗りが残るバグ回避） | `TableView.tsx:581-601` | CLAUDE.md にもルール明記。AG Grid のスタイル管理仕様の癖 |
| B-7 | **`rowData` への影シャドウフィールド `_idx` / `_errFields` / `_warnFields` / `_formulas`** | `rowData` 構築 `TableView.tsx:429-457` | `cellStyle` がクロージャを使えないため `params.data` 経由で渡す |
| B-8 | **バリデーション結果反映のため `refreshCells({ force: true })` 手動呼び出し** | `useEffect` `TableView.tsx:1281-1288` | `cellStyle` がデータ変化以外で再評価されない問題の対処 |
| B-9 | **`tableRecordsRef` (useRef) で stale closure 回避** | `TableView.tsx:380-381, 502-505` | `cellRenderer` 内から最新 records を参照するため |
| B-10 | **`stopEditingWhenCellsLoseFocus`** | `TableView.tsx:1318` | AG Grid のデフォルト編集挙動の補正 |
| B-11 | **列移動イベントの `source` 判定**（`uiColumnMoved` / `uiColumnDragged` のみ拾う） | `onColumnMoved` `TableView.tsx:1129` | プログラム経由の `setColumnDefs` まで保存しないようにするハック |
| B-12 | **`FormulaAwareTextEditor`** カスタムエディタ — `=` 式が既にあるセルで、表示値ではなく式テキストを編集開始値にする | `TableView.tsx:119-156` | AG Grid のデフォルトエディタが「表示値」しか初期値にしないため自作 |
| B-13 | **検索ジャンプ用に `forEachNodeAfterFilterAndSort` で記録 index → 表示 index を逆引き** | `handleSearchNavigate` `TableView.tsx:1174-1185` | レコード配列インデックスと表示インデックスがズレるため |
| B-14 | **CSS 直書きでフォーカスセル強調 (`inset box-shadow`)** | `grid-overrides.css:1-4` | デフォルトの border ハイライトが選択 / エラー枠と干渉するため |
| B-15 | **ペースト時の行解決を `getDisplayedRowAtIndex(displayIdx)?.data._idx` 経由で行う** | `handlePaste` `TableView.tsx:810-840` | `focusedCell.rowIndex` が表示順インデックスでありレコード順ではないため |
| B-16 | **Ctrl+C の優先順位を「範囲 > フィルタ後選択行 > フォーカスセル」に手動実装** | `handleKeyDown` `TableView.tsx:863-905` | `enableRangeSelection` 由来の自動クリップボードがないため |
| B-17 | **コメント三角マーカーを `position: absolute; inset: 0` の overlay で描画**（セル padding 外まで延長） | `CommentCellRenderer` `TableView.tsx:512-531` | AG Grid のセルの padding 内に描画すると角がズレる |
| B-18 | **`cellDataType: false`** で型自動変換を抑止 | `TableView.tsx:481` | `=` 式や semver 文字列を NaN にしないため |

### C. 諦めた / 妥協した特殊操作

`ISSUES.md` および CLAUDE.md に妥協痕跡が記録されているもの。

| # | 機能 | 状態 | 出典 |
|---|---|---|---|
| C-1 | **Autofill（フィルハンドル）** — Excel のセル右下ドラッグで連番・パターン展開 | 未実装 | `ISSUES.md` 1-5（`enableFillHandle` が Enterprise） |
| C-2 | **範囲ドラッグ時の autoscroll** — 範囲を画面外へドラッグでも自動スクロールしない | 未実装 | `ISSUES.md` 1-6-a |
| C-3 | **Shift+矢印キーでの範囲拡張** | 未実装 | `ISSUES.md` 1-6-b |
| C-4 | **範囲 / セルの cut+paste（枠線ドラッグで移動）** | 未実装 | `ISSUES.md` 1-6-c |
| C-5 | **列レベル式とセル単位式の表示区別** — `fx` バッジ表現が部分的、ホバーで式表示が未統一 | 部分対応（セルマーカーのみ） | `ISSUES.md` 5-5、`TableView.tsx:521-530` |
| C-6 | **国際化 / 言語切り替え** | 未実装 | `ISSUES.md` 11 |
| C-7 | **ヘッダー行の右クリックメニュー** — 現状はヘッダー内の `⋮` ボタンクリックでのみ。`onCellContextMenu` はヘッダーセルで発火しない | 妥協（クリックボタンで代替） | タスク背景にも記載、`ColumnHeader` `TableView.tsx:228-272` |
| C-8 | **`ColumnHeader` のチェックボックス選択状態を `addEventListener('selectionChanged')` で同期** — 本来 `headerCheckboxSelection` で済むが、filter 連動とアイコン制御を細かくしたかったため自作 | 自前実装で吸収 | `TableView.tsx:183-197` |

### B / C のまとめ（移行 ROI の実体）

- **B グループは合計でおおよそ 500 行強**（推定）の AG Grid 補正コード。これらは別ライブラリでは「素直な API 呼び出し」になるか、もしくは「同じく不要」になる。
- **C グループは 7 件、うち 4 件が範囲選択 / autofill 系**で、ライブラリの「範囲選択」プリミティブが正規化されているかどうかが移行の効用を左右する。
- 最大の構造的負担は **B-1（内部 DOM 属性パース）と B-2（範囲選択自作）の組合せ**。AG Grid の内部 DOM 構造が変わると一気に壊れる。

---

## 2. UI 操作要件リスト

DESIGN.md §9 と `ISSUES.md` および実装から、ユーザー操作と表示要件を抽出。**「○」= 対応済み、「△」= 部分対応、「×」= 未対応**。

### 2.1 セル操作

| ID | 操作 | 状態 |
|---|---|---|
| U-01 | セルをクリックしてフォーカス、詳細パネルに値・色・コメント・式を同期表示 | ○ |
| U-02 | セルを Enter / F2 / 文字キーで編集開始、Enter / Tab で確定 | ○ |
| U-03 | enum セルの編集はドロップダウン（`agSelectCellEditor`） | ○ |
| U-04 | bool セルの編集はチェックボックス（`agCheckboxCellEditor`） | ○ |
| U-05 | int / float / string / list セルの編集は `=` 式判定込みのテキスト入力 | ○ |
| U-06 | セル値が `=...` で始まる場合は式として保存（`RichCell.override`）、評価結果を表示 | ○ |
| U-07 | セルを右クリック → 色を設定（サブメニュー） | ○ |
| U-08 | セルを右クリック → コメントを編集（prompt） | ○ |
| U-09 | セルを右クリック → 式をオーバーライド（prompt） | ○ |
| U-10 | コメント付きセルに右上三角マーカーを表示、ホバーでツールチップ | ○ |
| U-11 | 式オーバーライドセルに `fx` マーカーを表示 | ○ |
| U-12 | validation エラーセルに赤枠、anomaly 警告セルに黄枠 | ○ |
| U-13 | セル色プリセット背景の描画 | ○ |
| U-14 | 編集不可フィールドはグレー斜体表示 | ○ |
| U-15 | export: false の列は背景グレー + ヘッダーグレー | ○ |

### 2.2 範囲選択 / クリップボード

| ID | 操作 | 状態 |
|---|---|---|
| U-20 | ドラッグまたは Shift+クリックで矩形範囲選択、選択範囲を青系背景で表示 | ○ |
| U-21 | 塗り色ありセルが範囲内のとき、塗り色と選択色の RGB 平均で背景描画 | ○ |
| U-22 | 範囲を画面外までドラッグしたら自動スクロール | × （C-2） |
| U-23 | Shift+矢印で範囲を拡張 | × （C-3） |
| U-24 | 範囲を Delete でクリア（値のみ消去、色 / コメント保持） | ○ |
| U-25 | 範囲を Ctrl+C で矩形 TSV としてクリップボードへ | ○ |
| U-26 | Ctrl+V でクリップボード TSV を貼り付け（範囲の左上起点、1×1 なら範囲全体にフィル） | ○ |
| U-27 | 範囲を右クリック → 色を一括適用 | ○ |
| U-28 | 範囲の枠線をドラッグして移動（cut+paste 相当） | × （C-4） |
| U-29 | フィル ハンドル（右下角ドラッグで連番 / パターン展開） | × （C-1） |
| U-30 | 複数行の選択（チェックボックス）と Ctrl+D でフォーカス列をフィルダウン | ○ |
| U-31 | フィルタ後の可視行だけを `forEachNodeAfterFilterAndSort` で扱う | ○ |

### 2.3 行操作

| ID | 操作 | 状態 |
|---|---|---|
| U-40 | ツールバー「行を追加」、右クリック「行を追加」 | ○ |
| U-41 | id 自動採番（既存 max + 1） | ○ |
| U-42 | 行を Delete キーで削除（範囲なしのとき） | ○ |
| U-43 | 行を右クリック「行を削除」 | ○ |
| U-44 | 先頭列のドラッグハンドルで行並び替え（`rowDragManaged`） | ○ |
| U-45 | ヘッダーチェックボックスでフィルタ可視行を全選択 | ○ |
| U-46 | 行ごとのチェックボックス選択 | ○ |

### 2.4 列操作

| ID | 操作 | 状態 |
|---|---|---|
| U-50 | カラムヘッダークリックでソート（昇順 / 降順 / 解除） | ○ |
| U-51 | カラムヘッダーに表示名 + フィールド名（モノスペース） | ○ |
| U-52 | カラムを左ドラッグで並び替え、結果を `TableFile.fields` に反映 | ○ |
| U-53 | カラム幅をドラッグで変更、結果を `TableFile.column_widths` に保存 | ○ |
| U-54 | カラムを右クリック / カラム内 `⋮` ボタンから「この列の設定を編集」「この列を削除」「列を追加」 | ○ |
| U-55 | カラムを左に固定 / 固定解除 | ○ |
| U-56 | カラム単位でのフィルター UI（AG Grid の組み込み） | ○ |
| U-57 | フィルタ中の「フィルタークリア ✕」フローティングボタン | ○ |
| U-58 | ヘッダー行の右クリックネイティブメニュー | × （C-7 — 現状はヘッダー内の `⋮` ボタン） |
| U-59 | 列の設定モーダル（display_name / formula / validation / anomaly） | ○ |
| U-60 | 列を追加モーダル（name / type / display_name / export） | ○ |
| U-61 | 列を削除（確認ダイアログ後、レコードからもフィールドデータを削除） | ○ |
| U-62 | computed フィールドの列レベル式（`FieldDef.formula`）の表示区別（列ヘッダーに `fx` バッジ） | △ （C-5） |

### 2.5 数式 / バリデーション

| ID | 操作 | 状態 |
|---|---|---|
| U-70 | 編集後 300ms debounce で自動バリデーション、ツールバーにバッジ表示、メッセージパネルに一覧 | ○ |
| U-71 | 列レベル式（`FieldDef.formula`）の自動評価 | ○ |
| U-72 | セル単位の `=` 式（`RichCell.override`）が列式より優先 | ○ |
| U-73 | 数式エラー（ゼロ除算・未定義参照・循環参照）はバリデーション errors に統合 | ○ |
| U-74 | 他テーブル参照 `ref(table, ids, col)` | ○ |

### 2.6 グローバル操作

| ID | 操作 | 状態 |
|---|---|---|
| U-80 | Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z で Undo / Redo（最大 50 件、テーブル単位） | ○ |
| U-81 | Ctrl+F で検索パネル、Ctrl+H で置換モード | ○ |
| U-82 | 検索ヒットへ ▲▼ でジャンプ、大小区別切替 | ○ |
| U-83 | ツールバーから JSON エクスポート | ○ |
| U-84 | フォルダを開く（File System Access API）、最後に開いたフォルダを IndexedDB から復元 | ○ |
| U-85 | 保存（フォーマット済み JSON で書き戻し） | ○ |
| U-86 | テーブル切替時に未保存変更があれば pending 状態として保持 | ○ |

### 2.7 将来要件（Phase 2 / 課題）

- U-90: テーブル間参照セルから参照先テーブルを開く（DESIGN.md §6 のサジェスト UI、現状 GUI 側に未実装）— **不明**: jump to ref のフローが未仕様
- U-91: 国際化（C-6）
- U-92: list 型のタグ入力 UI（現状はカンマ区切り文字列で入力）

---

## 3. 候補ライブラリの評価

### 3.1 候補別評価

| 軸 | AG Grid Community 継続 | TanStack Table v8 | Glide Data Grid | RevoGrid |
|---|---|---|---|---|
| 拡張性（U-* の素直さ） | 範囲選択 / コンテキストメニュー / autofill は **不可 or 自作**。Community の正規 API では U-22 / U-23 / U-28 / U-29 / U-58 は実現不可。 | **ヘッドレス**。レンダリングを自前で書くため範囲選択 / コンテキストメニュー / autofill は **自前で組める**（ライブラリの境界外）。仮想化は `@tanstack/react-virtual` 等別途。 | Canvas 描画で範囲選択・autofill・コピペが **正規 API として提供**。`onPaste` / `onCellsEdited` / `onGridSelectionChange` / `customRenderers` 等。U-22 autoscroll もデフォルトで動く。 | DOM 仮想化。`selection`・`paste`・`columnTypes`（rgEditor）等の API はあるが、ドキュメントが薄く、コンテキストメニューの正規化は **不明**。 |
| 型システム相性 | TypeScript 第一級だが `ColDef` 等が広い汎用型のため、`FieldDef` 駆動の型推論は中継ぎ関数が必要 | **第一級**。`ColumnDef<TData>` がジェネリック、`useReactTable<TData>` で型が一気通貫。`FieldDef` を `ColumnDef` に変換するだけ | TypeScript 提供。`getCellContent: (cell: Item) => GridCell` が中心 API で、`GridCell` を判別共用体で扱う設計。`FieldType` → `GridCellKind` のマッピングが必要 | TypeScript 提供だがコミュニティ事例が少なく型推論の細かい状況は **不明** |
| 版分離（Community / Enterprise） | 二層、移行動機の中核 | **単一版**（MIT） | **単一版**（MIT） | OSS と「revogrid Pro」アドオンが存在。core は MIT、有料アドオンの内容は **不明** |
| 10 万行性能 | 行仮想化のみ、列も仮想化可。実績多数 | 行仮想化はユーザー側で `@tanstack/react-virtual` を組合せる必要あり。DOM ノード数次第。10 万行は要検証 | **Canvas のため最有力**。100 万セル以上の事例あり（公式ベンチ） | DOM 仮想化、~10 万行クラスの事例は公開資料上 **不明** |
| `packages/core` との結合度 | 変更不要 | 変更不要（`FieldDef[]` → `ColumnDef[]` 変換層を gui に追加するだけ） | 変更不要だが、Canvas 描画になるため `cellRenderer` の React コンポーネントは使えず、`drawCell` か `customRenderers` を実装する必要あり | 変更不要、`columnTypes` で React コンポーネントを差し込める |
| 学習 / 実装コスト | ゼロ。ただし C-1〜C-7 を解決するための追加実装が必要 | **中**。レンダリング・スクロール・編集モード状態管理を自前で組む必要。既存 `TableView.tsx` のうち AG Grid 補正コード（B-*）が消える分は相殺 | **中〜大**。Canvas 描画ロジック（バリデーション枠線・コメントマーカー・色背景）の書き換えが大規模。React コンポーネントを直接置けないので CellDetailPanel など外側は流用 | **不明**（事例が少なく、ドキュメントから書き換え量を見積もりにくい） |
| 依存ライセンス | MIT（Community） | **MIT** | **MIT** | core は MIT、Pro 部分は不明 |
| メンテナンス活発度 | 商用、活発 | **非常に活発**（公式は週次〜月次リリース） | 活発（直近のリリースは確認可、ただしバージョンは要確認） | 活発度・リリース頻度は **不明**（要 GitHub 確認） |

### 3.2 各候補の代表的な操作実現可否

| 操作 | AG Grid Community | TanStack Table | Glide Data Grid | RevoGrid |
|---|---|---|---|---|
| U-22（範囲ドラッグの autoscroll） | × | 自作 | **○ 標準** | 不明 |
| U-23（Shift+矢印で範囲拡張） | × | 自作 | **○ 標準** | 不明 |
| U-28（範囲の cut+paste） | × | 自作 | **○ 標準 `onPaste` + `onCellsEdited`** | 不明 |
| U-29（フィルハンドル） | × | 自作 | **○ 標準 `onFillPattern`** | 不明 |
| U-58（ヘッダー右クリック） | △（自作で `onHeaderContextMenu` 相当を組む） | ○（任意に DOM ハンドラを付けるだけ） | ○（`onHeaderContextMenu`） | 不明 |
| 数式表示 / fx マーカー | ○ | ○ | △（Canvas に自前で描画） | ○ |
| バリデーション枠線 | ○（B-6 / B-7 のハック付き） | ○（CSS） | ○（Canvas border） | ○ |
| 検索ハイライト | ○ | ○ | ○ | ○ |
| 仮想スクロール | ○ | 自前で `@tanstack/react-virtual` | **Canvas 描画で 100 万セル級** | DOM 仮想化 |

参考 URL:
- AG Grid Community / Enterprise の機能差: https://www.ag-grid.com/javascript-data-grid/licensing/
- TanStack Table v8: https://tanstack.com/table/v8/docs/introduction
- Glide Data Grid: https://github.com/glideapps/glide-data-grid
- Glide Data Grid 公式ドキュメント: https://docs.grid.glideapps.com/
- RevoGrid: https://github.com/revolist/revogrid
- RevoGrid 公式ドキュメント: https://rv-grid.com/

### 3.3 推奨案

**第一推奨: Glide Data Grid**

理由:

1. **タスク 1 の B / C を最も多く解消する**。範囲選択・コピペ・autofill・autoscroll が **正規 API として提供**されており、現状 C-1〜C-4 に該当する未実装機能をライブラリの境界内で実装できる。B-2（範囲選択自作）・B-3（Delete capture）・B-15（行解決）・B-16（Ctrl+C 優先順位）の自作コードが大幅に縮む。
2. **単一版**（MIT）で、Community / Enterprise の認知負荷が消える。
3. **Canvas 描画で 10 万行クラスに対する性能余裕**が大きい（公式ベンチで 100 万セル級）。
4. ヘッダー右クリック（U-58）も `onHeaderContextMenu` が標準提供。

懸念点（実装コストとして見積もるべき項目）:

- React コンポーネントを `cellRenderer` として直接使えない。**コメント三角マーカー・fx マーカー・バリデーション枠線は Canvas に自前で描画**する必要がある（`drawCell` または `customRenderers` API）。
- `CellDetailPanel`・`Toolbar`・`SearchPanel`・`FieldEditModal`・`AddColumnModal` などグリッド外の React コンポーネントはほぼそのまま流用可能。
- 編集モーダル / プロンプト（コメント・式オーバーライド）の発火は Glide Data Grid の `onCellEdited` などのコールバックから自前ハンドリングする。
- `cellEditor` 相当（enum ドロップダウン・bool チェックボックス）は Glide Data Grid の `GridCellKind.Bubble`・`Boolean`・`Custom` を使い分ける必要があり、現状の `agSelectCellEditor` / `agCheckboxCellEditor` よりは設計負担が増える。

**第二推奨: TanStack Table v8（ヘッドレス）**

`packages/gui` を作り直す前提なら、TanStack Table の方が **React 流の自由度**が高く、Canvas 制約がない（React コンポーネントを直接置ける）。ただし範囲選択・autofill・autoscroll など spreadsheet 的操作は **すべて自作になる**点で、現状の AG Grid Community + 自作とコスト的にあまり変わらない可能性がある。React コンポーネントを自由に置きたい場合のみ第二推奨。

**継続（AG Grid Community のまま）について**

- メリット: 移行コストゼロ、ソート・フィルタ・行仮想化・列固定・行ドラッグは安定動作。
- デメリット: C-1〜C-4・C-7 が今後も「自作で AG Grid の内部 DOM に依存する形」でしか実装できず、保守性低下が継続する。AG Grid 32.x の DOM 構造変更（既に過去にあった）で B-1 が壊れるリスクは時間とともに上がる。

---

## 4. 数式エンジンの選定

### 4.1 現状実装の確認

`packages/core/src/formula.ts`（446 行）は **完全自前のトークナイザ + 再帰下降パーサ + エバリュエータ**。

- トークナイザ: NUMBER / STRING（シングルクォート）/ IDENT / 各種演算子 / AND / OR / NOT
- パーサ: `parseOr → parseAnd → parseNot → parseComparison → parseAddSub → parseMulDiv → parseUnary → parsePrimary`
- 評価: 算術 `+ - * / %`、比較 `== != < <= > >=`、論理 `AND OR NOT`、関数 23 個（`if`, `sum`, `avg`, `min`, `max`, `count`, `concat`, `length`, `ref`, `abs`, `round`, `floor`, `ceil`, `pow`, `sqrt`, `upper`, `lower`, `trim`, `substr`, `replace`, `int`, `float`, `str`, `and`, `or`, `contains`, `size`）
- エラー処理: `FormulaError` を投げ、`computeRecord` が `formulaErrors` 配列に push して validation errors に統合
- 循環参照検出: `detectComputedCycles`（DFS）

依存ライブラリは **ゼロ**。テストは `__tests__/formula.test.ts`（83 行）で基本動作確認済み。

### 4.2 候補比較

| 軸 | 自前実装（現状） | jsep | expr-eval | mathjs |
|---|---|---|---|---|
| カラム参照 | ○（`IDENT` 解決を直接書ける） | △（AST を返すだけ。評価は自前） | △（変数を `parse(expr).evaluate({...})` で渡せる。式中の `IDENT` ≒ 変数） | ○（scope を渡せる） |
| 四則 / 比較 / 条件 | ○ | ○（AST のみ） | ○ | ○ |
| `if(cond, a, b)` | ○ | 自前評価で `ConditionalExpression` を扱う必要 | ○（`?:` 演算子と if 関数の両方サポート） | ○ |
| `sum / avg / min / max / count` | ○ | 自前 | ○（カスタム関数登録可能） | ○（標準） |
| `ref(table, ids, col)` | ○（テーブル間参照を含む独自関数） | 自前 | カスタム関数として登録可能 | カスタム関数として登録可能 |
| エラー処理の構造化 | ○（`FormulaError` で field・message をハンドラに渡せる） | △（パースエラーのみ。評価は自前） | △（`Error` を投げる、メッセージのみ） | △（`Error` を投げる、種別判定はメッセージ解析になる） |
| バンドルサイズ | ゼロ（自前） | 約 12 KB（minified） | 約 13 KB（minified） | **約 600 KB（minified）** |
| ライセンス | — | MIT | MIT | Apache-2.0 |

参考:
- jsep: https://github.com/EricSmekens/jsep
- expr-eval: https://github.com/silentmatt/expr-eval
- mathjs: https://github.com/josdejong/mathjs

### 4.3 結論

**自前実装の継続を推奨**。

- すでに必要な構文・関数（U-71〜U-74）が網羅されており、`FormulaError` を介した構造化エラーが validation 統合（U-73）にそのまま組み込まれている。
- 循環参照検出（`detectComputedCycles`）が独自の DFS で実装されており、外部ライブラリでは同じ意味論を再構築するコストがかかる。
- mathjs は **600 KB と GUI 全体のバンドル肥大化**になり、SPA の初期ロードに悪影響。
- jsep / expr-eval を採用しても、`ref()`・型強制・エラー位置トラッキング・循環検出は **どのみち自前で書く部分**が残り、純粋な置き換え効果が薄い。

**現状の `formula.ts` は維持し、必要なら以下の補強のみを検討**:

- パースエラーに行・列位置を含める（現在は文字列メッセージのみ）
- 数値 / 文字列の暗黙変換ルールをドキュメント化（DESIGN.md §8 のさらに詳細）
- 関数の引数型バリデーション（現状は実行時に NaN / undefined になるパターンあり）

---

## 5. 最小検証プロトタイプの設計

**対象ライブラリ**: Glide Data Grid（推奨案）

**目的**: sheetcraft の 1 テーブル（`example/master/character.json` 相当）を読み込み、AG Grid 版で苦労していた以下 4 操作が **Glide Data Grid の正規 API で素直に書けるか**を確認する。

### 5.1 検証する操作

1. **U-22 範囲ドラッグ時の autoscroll** — Glide Data Grid のデフォルトで動作するか
2. **U-29 フィルハンドル autofill** — `onFillPattern` が動作するか
3. **U-58 ヘッダー行の右クリック** — `onHeaderContextMenu` が発火するか
4. **U-12 バリデーションエラー枠線** — `drawCell` または `customRenderers` で赤枠が描画できるか
5. **U-10 コメント三角マーカー** — `drawCell` で右上に三角を描画できるか

### 5.2 ファイル構成

| ファイル | 役割 | 想定行数 |
|---|---|---|
| `packages/gui-proto/package.json` | `@glideapps/glide-data-grid` 依存追加、`vite` で `:5174` で起動 | 約 20 |
| `packages/gui-proto/index.html` | Vite エントリ | 約 10 |
| `packages/gui-proto/src/main.tsx` | React マウント | 約 10 |
| `packages/gui-proto/src/App.tsx` | フォルダ未対応で `example/master/character.json` を静的 import で読み込み | 約 30 |
| `packages/gui-proto/src/GlideTableView.tsx` | Glide Data Grid 表示・編集・範囲操作・autofill・ヘッダー右クリック・カスタム描画 | 約 150 |
| **合計** | | **約 220 行** |

### 5.3 `packages/core` からの import

- `parseTableFile`、`validateTable`、`computeRecord`、`isRichCell`、`resolveFields`
- 型: `TableFile`、`FieldDef`、`Cell`、`RichCell`、`SimpleCell`、`ValidationResult`
- core 側の変更は **不要**

### 5.4 検証ポイントのチェックリスト

| ポイント | 期待動作 | 検証方法 |
|---|---|---|
| 仮想スクロール | 100 行で fps 60、10 万行でも操作可能 | `example/master/` に 10 万行 ダミー生成スクリプトを用意して開いて操作 |
| 範囲ドラッグ + autoscroll | 範囲を画面外までドラッグでスクロールする | 100 行 / 50 列のテストテーブルでドラッグ |
| Shift+矢印で範囲拡張 | Shift+矢印で範囲が拡張される | キーボード操作 |
| ヘッダー右クリック | コンテキストメニュー（自作 React コンポーネント）が表示される | `onHeaderContextMenu` |
| autofill | セル右下ハンドルドラッグで連番展開（int 列） | `onFillPattern` |
| バリデーション赤枠 | `validateTable` のエラーに対応するセルに赤枠 | `drawCell` または `customRenderers` |
| コメント三角マーカー | RichCell に comment があれば右上に三角描画、ホバーで内容表示 | `drawCell` + `onItemHovered` |
| enum 編集 | enum 列で編集時にドロップダウンが出る | `GridCellKind.Bubble` または `Custom` |
| `=` 式入力 | セルに `=hp*2` 入力で式として保存、表示は評価結果 | `onCellEdited` で raw を保存、`getCellContent` で computed 値表示 |
| TSV ペースト | Excel から複数行コピー → Glide Data Grid に貼り付け | `onPaste` |
| バンドルサイズ | dev build で 1 MB 以下、prod build で確認 | `vite build` 出力 |

### 5.5 検証の判定基準

- **○ 採用判断**: 5.4 のうち少なくとも 7 / 11 が「ライブラリの正規 API で実現」できれば、本格移行に進む。
- **△ 部分採用**: 4〜6 件のみ実現で、未対応分が現状 AG Grid と同等以下のコストなら、`packages/gui` の段階的書き換えで Glide Data Grid を導入。
- **× 不採用**: 3 件以下、または autoscroll / autofill 等のコア機能が動かない場合は **TanStack Table v8** に切替検証。

---

## 6. 判断に必要だが現時点で不明な事項（確認依頼）

| # | 項目 | 確認したい内容 |
|---|---|---|
| Q-1 | RevoGrid Pro の機能境界 | コア（MIT）部分のみで本タスクの U-* 要件（特に範囲選択・autofill・ヘッダー右クリック）が満たせるか。公開ドキュメント上で明確に切り分けられていなかった |
| Q-2 | 10 万行の現実性 | DESIGN.md には「通常 100 行、最大 10 万行」とあるが、実プロジェクトで 1 テーブル 10 万行クラスのデータが現実にあるか、それともこのキャップは将来の備えか。Glide Data Grid 推奨の根拠の重みが変わる |
| Q-3 | Phase 2（GitHub 連携）の優先度 | DESIGN.md §2 Phase 2 の着手時期。移行と Phase 2 着手が重なるなら、移行は Phase 2 後に延期する選択肢もある |
| Q-4 | i18n（C-6）の着手予定 | 文言外出し作業は移行と同時にやる方が効率的。移行と独立にやる場合は移行のスコープから除外 |
| Q-5 | ライブラリ間のマイグレーション粒度 | `packages/gui` を「丸ごと書き直し（新パッケージ）」と「段階的に AG Grid を Glide Data Grid に差し替え」のどちらを想定しているか。プロトタイプの設計はどちらでも進められるが、本実装の進め方が変わる |
| Q-6 | テーブル間参照 UI（U-90） | DESIGN.md §6 にある「`int` + `ref` のサジェスト付きドロップダウン」と、参照先テーブルへのジャンプは Phase 1 で実装するか。実装するならライブラリ選定の評価軸に加える |
| Q-7 | list 型のタグ入力 UI（U-92） | 現状はカンマ区切り文字列で編集。本格的なタグ入力 UI（chip 表示・サジェスト）を採るかどうかで、`customRenderers` の必要数が変わる |
| Q-8 | Canvas 描画への移行に伴うアクセシビリティ | Glide Data Grid は Canvas のため、スクリーンリーダー対応は DOM 描画ライブラリより劣る。サポート対象として要件にあるか |
| Q-9 | 既存テストの担保 | 現在 `packages/gui` に GUI のユニットテスト / E2E テストが見当たらない（`packages/core` のみ）。移行時の回帰検証をどう担保するか（手動 / Playwright 等の導入を含めるか） |
| Q-10 | バンドルサイズの上限 | GitHub Pages デプロイ済み（`ISSUES.md` §10）。初期ロード重視なら mathjs 不採用根拠を強化、Canvas 描画の bundle 増加分も評価軸に入れる |
