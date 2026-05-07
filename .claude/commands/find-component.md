UI の変更対象となるコンポーネントを特定する。実装前に必ずこのスキルで対象を確認すること。

使い方: `/find-component 列ヘッダー`

```bash
QUERY="$ARGUMENTS"
echo "=== コンポーネントファイル一覧 ==="
find /Users/yoshinotakuya/Documents/GitHub/sheetcraft/packages/gui/src/components -name "*.tsx" | sort

echo ""
echo "=== キーワード検索: $QUERY ==="
grep -rn "$QUERY" /Users/yoshinotakuya/Documents/GitHub/sheetcraft/packages/gui/src/ --include="*.tsx" --include="*.ts" | head -20
```
