GUI の開発サーバーを起動する。
ポートは 5173 固定。すでに同ポートで vite が稼働中の場合はキルしてから起動する。

```bash
export PATH="$HOME/.nodebrew/node/v25.9.0/bin:$PATH"
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
sleep 1
npm run dev -w packages/gui
```
