---
name: dev
description: SheetCraft の GUI 開発サーバーを起動する。ポート 5173 固定、既存プロセスがあればキルしてから起動する。「開発サーバー」「dev server」「起動」と言われたら使用する。
version: 1.0.0
---

# Dev Server Skill

GUI の開発サーバー（Vite）を起動する。ポートは 5173 固定（`vite.config.ts` の `strictPort: true`）。既存の Vite プロセスがあればキルしてから起動する。

## 実行

```bash
export PATH="$HOME/.nodebrew/node/v25.9.0/bin:$PATH"
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
sleep 1
npm run dev -w packages/gui
```

## 補足

- バックグラウンド実行する場合は `run_in_background: true` で起動する
- `vite.config.ts` で `strictPort: true` のため、5173 が使えない場合は別ポートに切り替わらず起動失敗する
