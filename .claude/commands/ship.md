ビルド・テストを通してからプッシュし、PR を作成または更新する。

```bash
export PATH="$HOME/.nodebrew/node/v25.9.0/bin:$PATH"
npm run build -w packages/core && npm run build -w packages/gui && npm test -w packages/core && git push origin $(git branch --show-current) && gh pr create --repo ta98cb250f/sheetcraft --base develop || gh pr view --repo ta98cb250f/sheetcraft --web
```
