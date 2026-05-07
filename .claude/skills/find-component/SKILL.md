---
name: find-component
description: SheetCraft GUI の変更対象コンポーネントを特定する。「ヘッダーに〜」「列に〜」「モーダルに〜」など UI の場所を示す指示を受けたら、実装前に必ずこのスキルで対象ファイルを確認する。
version: 1.0.0
---

# Find Component Skill

UI 変更の指示を受けたら、必ず対象コンポーネント（ファイル）を特定してから実装する。思い込みで別のコンポーネントを編集して時間を浪費するのを防ぐ。

## 使い方

```bash
QUERY="<ユーザーが指示した場所のキーワード>"
echo "=== コンポーネントファイル一覧 ==="
find /Users/yoshinotakuya/Documents/GitHub/sheetcraft/packages/gui/src/components -name "*.tsx" | sort

echo ""
echo "=== キーワード検索: $QUERY ==="
grep -rn "$QUERY" /Users/yoshinotakuya/Documents/GitHub/sheetcraft/packages/gui/src/ --include="*.tsx" --include="*.ts" | head -20
```

## 主なコンポーネント

| 場所 | ファイル |
|---|---|
| 列ヘッダー（テーブルの上端） | `TableView.tsx` の `ColumnHeader` |
| 列の設定モーダル | `FieldEditModal.tsx` |
| 列追加モーダル | `AddColumnModal.tsx` |
| セル右クリックメニュー | `TableView.tsx` の `buildContextMenuItems` |
| 詳細パネル（右側） | `CellDetailPanel.tsx` |
| 検索パネル | `SearchPanel.tsx` |
| ツールバー（上端） | `Toolbar.tsx` |
| テーブル一覧（左側） | `TableList.tsx` |
