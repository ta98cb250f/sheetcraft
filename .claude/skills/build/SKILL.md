---
name: build
description: SheetCraft の core と GUI をビルドする。型チェック含む。「ビルド」「build」「型チェック」と言われたら使用する。
version: 1.0.0
---

# Build Skill

core と GUI をビルドする。型チェックも含まれる。

## 実行

```bash
export PATH="$HOME/.nodebrew/node/v25.9.0/bin:$PATH"
npm run build -w packages/core && npm run build -w packages/gui
```

## 想定エラー

- 型エラーが出たら原因を特定して修正する
- `npm` が見つからない場合は PATH に nodebrew を追加（先頭の export 行で対応済み）
