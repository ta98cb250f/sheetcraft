AG Grid の機能が Community 版で使えるか確認する。Enterprise モジュールへの参照がある場合は Community では使用不可。

使い方: `/check-agrid-community getMainMenuItems`

```bash
FEATURE="$ARGUMENTS"
echo "=== Community types に存在するか ==="
grep -n "$FEATURE" /Users/yoshinotakuya/Documents/GitHub/sheetcraft/node_modules/ag-grid-community/dist/types/core/entities/gridOptions.d.ts | head -5

echo ""
echo "=== Enterprise モジュール参照があるか（あれば Community では使用不可）==="
grep -o "${FEATURE}[^}]*}" /Users/yoshinotakuya/Documents/GitHub/sheetcraft/node_modules/ag-grid-community/dist/ag-grid-community.js | grep -i "enterprise\|module:" | head -5

echo ""
echo "=== 参照なければ Community で使用可 ==="
```
