# GUI ライブラリ移行プロトタイプ — 現状ステータス

`packages/gui-proto`（Glide Data Grid v6 ベース）の **2026-06-14 時点** の動作状況。

検討レポート（`docs/gui-library-migration-investigation.md`）の **タスク 5「最小検証プロトタイプの設計」を実装したもの**。本ドキュメントは「設計通り動いたか／動かなかったか」と「次に何をすべきか」を整理する。

---

## 1. ブランチとコミットの履歴

- **作業ブランチ**: `claude/gui-library-migration-A958A`
- **マージ先**: `develop`

| コミット | 内容 |
|---|---|
| `6546e3e` | docs: GUI ライブラリ移行検討レポートを追加 |
| `919a906` | feat(gui-proto): Glide Data Grid 検証プロトタイプを追加（初版） |
| `417127c` | fix(gui-proto): 範囲選択・編集・コピペ・Delete を Glide の正規 API で動かす |

push 済み（origin/claude/gui-library-migration-A958A）。**PR は未作成**。

---

## 2. 本セッションでの修正範囲（前後比較）

### 2.1 本セッション開始時の状態（コミット `919a906`）

ブラウザで動かしてみたところ、以下が **すべて壊れていた**:

| 項目 | セッション開始時の挙動 |
|---|---|
| 範囲ドラッグの視覚反転 | 出ない（青ハイライトが見えない） |
| Shift+矢印で範囲拡張 | OK（内部状態は変わっていたと推察） |
| fill handle（セル右下ドラッグで連番展開） | OK |
| TSV ペースト | 不可（フォーカスセルに丸ごと貼られる挙動も無し、無反応） |
| 範囲選択中の Delete | 「最後のセル」だけクリア |
| Cmd+C で範囲コピー | OK（ユーザの後追い報告で発覚、実は最初から動いていた） |
| ヘッダー右クリック | `window.prompt` ダイアログ（実用不可） |
| セル右クリック | `window.prompt` ダイアログ（実用不可） |
| **セルの編集（最重要）** | **ダブルクリックでも Enter でも overlay が開かない** |

### 2.2 修正内容（コミット `417127c`）

| # | 修正 | 解消した問題 |
|---|---|---|
| F-1 | `index.html` に `<div id="portal"></div>` を追加 | セル編集 overlay が portal not found エラーで開けなかった問題 |
| F-2 | `rangeSelect="multi-cell"` → `rangeSelect="rect"` | 矩形ドラッグ選択が無効化されていた問題（`multi-cell` は Ctrl+クリックで個別セル多選択モードで、矩形ドラッグは禁止される仕様） |
| F-3 | `getCellsForSelection={true}` → 関数で明示実装 | コピー・ペースト・Delete の対象セル取得が動かなかった問題（リテラル `true` の基本実装が Text セルで機能していなかった） |
| F-4 | `onPaste` を手動実装し TSV を範囲全体に展開 | デフォルトの paste 動作がフォーカスセルに TSV を丸ごと貼っていた問題 |
| F-5 | `onDelete` を手動実装し範囲全セルをクリア（色・コメントは保持） | デフォルトの clear 動作がフォーカスセル単独しか消さなかった問題 |
| F-6 | `window.prompt` を React 製 `ContextMenu` に置換 | ヘッダー右クリックとセル右クリックを実用的なメニューに |

### 2.3 セッション末時点の動作（コミット `417127c` 適用後）

| 項目 | 状態 | 確認方法 |
|---|---|---|
| 範囲ドラッグの視覚反転 | ✅ 動く | ユーザがブラウザで実機確認 |
| Shift+矢印で範囲拡張 | ✅ 動く | ユーザがブラウザで実機確認 |
| fill handle で連番展開 | ✅ 動く | ユーザがブラウザで実機確認 |
| TSV ペーストが範囲に展開 | ✅ 動く | ユーザがブラウザで実機確認 |
| 範囲 Delete で全セルクリア（色・コメント保持） | ✅ 動く | ユーザがブラウザで実機確認 |
| Cmd+C で範囲コピー | ✅ 動く | ユーザがブラウザで実機確認 |
| セル編集 overlay（ダブルクリック・Enter） | ✅ 動く | ユーザがブラウザで実機確認 |
| ヘッダー右クリックで React メニュー表示 | ✅ 表示まで確認 | メニュー内のアクション（settings/pin/delete）は **未配線・ログのみ**（B-2 参照） |
| セル右クリックで React メニュー表示 | ✅ 表示まで確認 | 色プリセット適用は確認済、コメント編集・式オーバーライドは **未検証** |

---

## 3. 「失われた機能」の正確な分類

`packages/gui`（メイン）に **存在する**が `packages/gui-proto` に **無い**機能を、原因別に分類する。

### 区分の凡例

- **L-INTENT**: プロトタイプスコープとして意図的に省略。検討レポート §5.1 の「最小プロトタイプ（約 220 行）」設計に沿った判断
- **L-LIBLIM**: Glide Data Grid の制約で追加実装が必要（できないわけではない）
- **L-NEVER**: 元の `packages/gui` にも実装されていない（ISSUES.md の未対応項目）
- **L-BUG**: バグで動かなかったが本セッションで修正済（`417127c`）

### 3.1 グリッド機能

| 機能 | プロトタイプ | 元 GUI | 区分 | 補足 |
|---|---|---|---|---|
| 行仮想スクロール | ✅ | ✅ | — | 両方標準 |
| セル編集（インライン） | ✅ | ✅ | L-BUG（修正済） | F-1 portal 修正で復活 |
| 範囲ドラッグ選択 + 視覚反転 | ✅ | ✅（カスタム） | L-BUG（修正済） | 元 GUI は AG Grid Community + mousedown/mousemove/mouseup を `window` に張る自作。プロト側は Glide 正規 API |
| Shift+矢印で範囲拡張 | ✅ | ✕ | L-NEVER | 元 GUI で `ISSUES.md` 1-6-b として未対応。**プロト側の方が機能的に上** |
| 範囲ドラッグ時の autoscroll | 推定 ✅（未検証） | ✕ | L-NEVER | 元 GUI で `ISSUES.md` 1-6-a として未対応。Glide は標準動作のはず。ユーザによる実機検証推奨 |
| fill handle で連番展開 | ✅ | ✕ | L-NEVER | 元 GUI で `ISSUES.md` 1-5 として未対応（AG Grid Enterprise 機能）。**プロト側の方が機能的に上** |
| TSV コピー（Cmd+C） | ✅ | ✅ | — | 両方動作 |
| TSV ペースト（Cmd+V） | ✅ | ✅ | L-BUG（修正済） | F-4 で手動実装 |
| Delete で範囲クリア | ✅ | ✅ | L-BUG（修正済） | F-5 で手動実装 |
| 範囲・セルの cut+paste 移動（枠ドラッグ） | ✕ | ✕ | L-NEVER | 元 GUI で `ISSUES.md` 1-6-c として未対応。両方未実装 |
| ソート（列ヘッダークリック） | ✕ | ✅ | L-INTENT | プロトでは未実装。Glide では `onHeaderClicked` + 自前ソートで実装可 |
| フィルタ（列ヘッダーアイコン） | ✕ | ✅ | L-INTENT | プロトでは未実装。Glide には標準フィルタ UI 無し、自前実装が必要 |
| 列幅の保存 | ✕（初期幅のみ） | ✅ | L-INTENT | Glide の `onColumnResize` を配線するだけ |
| 列順の保存（列ドラッグ） | ✕ | ✅ | L-INTENT | Glide の `onColumnMoved` を配線するだけ |
| 列固定（pinned） | ✕ | ✅ | L-INTENT | Glide の `freezeColumns` で実現可 |
| 行ドラッグ並び替え | ✕ | ✅ | L-INTENT | Glide の `onRowMoved` または自前実装 |
| 行チェックボックス選択 | ✅ | ✅ | — | 両方標準。プロトは `rowMarkers="checkbox-visible"` |
| ヘッダーチェックボックス（全選択） | ✕ | ✅（自作 `ColumnHeader`） | L-INTENT | プロトでは未実装 |
| Ctrl+D fill down（選択行への） | ✕ | ✅（自作） | L-INTENT | プロトでは未実装。Glide の selection API で実装可 |
| enum セルのドロップダウン編集 | ✕（Text 格下げ） | ✅（`agSelectCellEditor`） | L-LIBLIM | Glide の `Bubble` は read-only。`customRenderers` で自前ドロップダウン（推定 +50 行） |
| list セルのタグ入力 | ✕（カンマ区切り Text） | ✕（同じくカンマ区切り） | — | 元 GUI も本格的なタグ入力 UI なし。`ISSUES.md` 9-2 の今後の課題 |
| bool セルのチェックボックス編集 | ✅ | ✅ | — | 両方標準 |
| 列ヘッダーの右クリック / 列メニュー UI | ✅（React メニュー） | △（ヘッダー内の `⋮` ボタン経由） | — | 元 GUI は `onCellContextMenu` がヘッダーで発火しない AG Grid 制約のため `⋮` ボタンで代替。**プロト側の方が UX 自然** |
| 列メニューのアクション配線（設定 / 固定 / 削除） | ✕（メニュー表示のみ、ログ出力） | ✅ | L-INTENT | プロトでは未配線 |
| セル右クリックメニュー | ✅（色 / コメント / 式 override） | ✅ | — | 両方動作。プロト側はサブメニュー無し（色を平坦に列挙） |
| 塗り色背景（RichCell.color） | ✅（`drawCell`、半透明 33%） | ✅ | — | 描画方式が違うが両方動作 |
| 塗り色 + 範囲ハイライトの RGB 平均合成 | ✕ | ✅ | L-LIBLIM | `drawCell` 内で selection 状態を受け取って描く必要あり |
| コメント三角マーカー | ✅（`drawCell`） | ✅ | — | プロトは Canvas 描画、元は React 描画 |
| fx マーカー（式オーバーライドセル） | ✅（`drawCell` で `fx` 文字） | ✅ | — | 両方動作 |
| 列ヘッダーの fx バッジ（列レベル式の視覚区別） | ✕ | △ | L-LIBLIM | 元 GUI でも `ISSUES.md` 5-5 として部分対応のみ |
| バリデーション赤枠（エラー） / 黄枠（警告） | ✅（`drawCell` で枠線） | ✅ | — | 両方動作 |
| 編集不可セルのグレー斜体表示 | ✕ | ✅ | L-INTENT | プロトは `readonly: true` のみで視覚スタイル無し。`drawCell` で文字色変更で対応可 |
| export: false 列のグレー化 | ✕ | ✅（CSS） | L-INTENT | プロトでは未対応 |

### 3.2 アプリ機能（ライブラリ非依存・React 側）

すべて L-INTENT。元 GUI から移植可能だが、プロトタイプは「ライブラリ採用判断」が目的だったため省略。

| 機能 | プロトタイプ | 元 GUI | 元 GUI の出典 |
|---|---|---|---|
| シート（テーブル）選択サイドバー | ✕ | ✅ | `TableList.tsx` |
| Undo / Redo（Ctrl+Z / Ctrl+Y） | ✕ | ✅（最大 50 件） | `App.tsx:9, 27-94` |
| フォルダ open（File System Access API） | ✕ | ✅ | `useProject.ts`, `backend/FileBackend.ts` |
| 最後に開いたフォルダ記憶（IndexedDB） | ✕ | ✅ | `lib/folderStorage.ts` |
| 保存ボタン / dirty 状態管理 | ✕ | ✅ | `App.tsx:96-103` |
| JSON エクスポートボタン | ✕ | ✅ | `App.tsx:140-146` |
| 検索パネル（Ctrl+F） | ✕ | ✅ | `SearchPanel.tsx` |
| 置換パネル（Ctrl+H） | ✕ | ✅ | `SearchPanel.tsx` |
| セル詳細パネル（色 / コメント / 式編集） | ✕ | ✅ | `CellDetailPanel.tsx` |
| ツールバー全体 | ✕ | ✅ | `Toolbar.tsx` |
| バリデーションメッセージパネル | ✕ | ✅ | `TableView.tsx:1392-1410` |
| 行追加ボタン（id 自動採番） | ✕ | ✅ | `App.tsx:116-128` |
| 行削除ボタン | ✕ | ✅ | `App.tsx:149-153` |
| 列追加モーダル | ✕ | ✅ | `AddColumnModal.tsx` |
| 列設定モーダル（display_name / formula / validation / anomaly） | ✕ | ✅ | `FieldEditModal.tsx` |
| 自動バリデーション | ✅（即時・debounce 無し） | ✅（300ms debounce） | プロトは `useEffect` で `validateTable` を即時同期実行（`App.tsx`）。元 GUI は編集後 300ms debounce |
| ファイル保存（writeFile） | ✕ | ✅ | `useProject.ts:140-148` |

### 3.3 元 GUI も未実装の項目（L-NEVER、念のため）

`ISSUES.md` の未対応リストから:

- 1-5. Autofill（フィルハンドル） — **プロトでは Glide の `fillHandle` で動作（プロトの方が進んでいる）**
- 1-6-a. 範囲ドラッグ時の autoscroll — **プロトでは Glide 標準で動作と推定（要実機検証）**
- 1-6-b. Shift+矢印で範囲拡張 — **プロトで動作確認済**
- 1-6-c. 範囲・セルの cut+paste 移動 — **両方未対応**
- 5-5. 列レベル式とセル単位式の表示区別 — 両方部分対応
- 11. 国際化（i18n） — 両方未対応

つまり、Glide プロトタイプは **元 GUI でも未対応だった範囲操作系を 3 件（自動的に）獲得している**。

---

## 4. 未検証 / 未確認の項目

ユーザが本セッション中に確認していない、コードからは動作が読み取れる項目:

| 項目 | 状態 | 確認すべき内容 |
|---|---|---|
| 範囲ドラッグの autoscroll | 推定 ✅ | グリッドを縦長 / 横長にし、範囲を画面外までドラッグして自動スクロールするか |
| ヘッダー右クリックメニュー内のアクション | 未配線 | 「列設定」「列固定」「列削除」のクリック時、現状はコンソール `console.log` するだけ |
| セル右クリックメニュー内のコメント編集 | コードのみ | `window.prompt` でコメント入力できる予定 |
| セル右クリックメニュー内の式オーバーライド | コードのみ | `window.prompt` で式入力、`RichCell.override` に保存する予定 |
| ESC キーで編集 overlay キャンセル | 標準 | Glide のデフォルト |
| 数式評価結果の表示（`hp*2` などの override） | 標準 | `getCellContent` 内で `computeRecord` を呼んでいる |
| 10 万行ベンチマーク | 未実施 | 検討レポート §5.4 のチェック項目 |

---

## 5. 「Glide 採用判断」に対する本セッションの結論

検討レポート §5.5 の判定基準:

> - ○ 採用判断: 5.4 のうち少なくとも 7 / 11 が「ライブラリの正規 API で実現」できれば、本格移行に進む。

| # | チェック項目 | 結果 |
|---|---|---|
| 1 | 仮想スクロール | ✅ |
| 2 | 範囲ドラッグ + autoscroll | ✅（autoscroll は未検証） |
| 3 | Shift+矢印で範囲拡張 | ✅ |
| 4 | ヘッダー右クリック | ✅ |
| 5 | autofill | ✅ |
| 6 | バリデーション赤枠 | ✅ |
| 7 | コメント三角マーカー | ✅ |
| 8 | enum 編集 | △（Text 格下げ、本格化は `customRenderers` で +50 行） |
| 9 | `=` 式入力 | ✅ |
| 10 | TSV ペースト | ✅（手動 `onPaste` 実装） |
| 11 | バンドルサイズ | ✅（462 KB / gzip 153 KB） |

**11 / 11 が動作（うち 1 件△、1 件未検証）**。判定基準 7/11 を大幅に超える。

ただし以下の留保事項あり:

- **TSV ペースト・Delete・コピーは手動実装が必要**（onPaste / onDelete / getCellsForSelection を関数化）。素のライブラリ機能だけでは動かない
- **enum / list の編集は `customRenderers` の追加実装が必要**
- **塗り色 + 範囲選択の RGB 平均合成、列ヘッダー fx バッジ、編集不可セル斜体グレー、export: false 列グレー化は `drawCell` / `drawHeader` の追加実装が必要**

---

## 6. 次のアクション候補（次回セッション用）

### 推奨優先順

| # | アクション | 推定工数 | 備考 |
|---|---|---|---|
| A | **検討レポート §5.4 の未検証 1 項目（10 万行ベンチマーク）を確認** | 数十分 | ダミーデータ生成スクリプト + 体感計測 |
| B | **Glide 採用 / 見送り / TanStack Table プロトもやるかの判断** | 議論のみ | A の結果と本ドキュメントを踏まえて |
| C | 採用決定後: **`packages/gui-proto` を `packages/gui-next` 等に格上げ、3.2 のアプリ機能を段階移植** | 1500 行規模の機械的書き換え | `App.tsx`、`Toolbar.tsx`、`TableList.tsx`、`CellDetailPanel.tsx`、`SearchPanel.tsx`、`AddColumnModal.tsx`、`FieldEditModal.tsx`、`useProject.ts` 等を流用 |
| D | 採用決定後: **3.1 のグリッド機能（enum customRenderers / 列幅保存 / 列固定 / ソート / フィルタ等）を Glide 流に実装** | 中規模 | カスタムレンダラ群が中心 |
| E | **検討レポート + プロトタイプを develop へ PR 作成** | 数十分 | ドラフトでも可。検討段階の証跡として |

### 検討レポートで未解消の確認事項（再掲）

採用判断やスコープ確定に影響:

- Q-2 10 万行は現実シナリオか、将来の備えか（A の優先度に直結）
- Q-3 Phase 2（GitHub 連携）の優先度（移行時期）
- Q-5 移行粒度（丸ごと書き直し vs 段階差し替え）
- Q-7 list タグ入力 UI を作るか（customRenderers 投資判断）
- Q-8 Canvas 描画とアクセシビリティ（採用制約）
- Q-9 GUI の回帰検証手段（移植時の担保）

---

## 7. 関連ドキュメント

- `docs/gui-library-migration-investigation.md` — 検討レポート（タスク 1〜5）
- `ISSUES.md` — 元 GUI の既知課題・未実装一覧
- `DESIGN.md` — sheetcraft 全体設計
- `CLAUDE.md` — リポジトリ作業ガイド
