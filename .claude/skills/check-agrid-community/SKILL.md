---
name: check-agrid-community
description: AG Grid の機能が Community 版で使えるか確認する。Enterprise モジュールへの参照がある場合は Community では使用不可のため、AG Grid の機能を実装する前に必ずこのスキルを使う。
version: 1.0.0
---

# Check AG Grid Community Skill

AG Grid の機能を実装する前に、Community 版で使用可能か確認する。

## 背景

`ag-grid-community` の型定義（`gridOptions.d.ts`）には Enterprise 機能の API も含まれているため、型上は使えるが実行時に Enterprise モジュールが要求されるケースがある。実装後にエラーで気づくのを防ぐため、事前にバンドルの実装を grep して Enterprise 参照の有無を確認する。

## 使い方

```bash
FEATURE="<確認したい機能名>"
echo "=== Community types に存在するか ==="
grep -n "$FEATURE" /Users/yoshinotakuya/Documents/GitHub/sheetcraft/node_modules/ag-grid-community/dist/types/core/entities/gridOptions.d.ts | head -5

echo ""
echo "=== Enterprise モジュール参照があるか（あれば Community では使用不可）==="
grep -o "${FEATURE}[^}]*}" /Users/yoshinotakuya/Documents/GitHub/sheetcraft/node_modules/ag-grid-community/dist/ag-grid-community.js | grep -i "enterprise\|module:" | head -5
```

## 判定

- `module: "@ag-grid-enterprise/...` という出力がある → Community では使用不可。代替実装（カスタムコンポーネントなど）を検討する
- 出力がない → Community で使用可能
