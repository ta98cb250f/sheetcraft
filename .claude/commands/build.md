core と GUI をビルドする。型チェックを含む。

```bash
export PATH="$HOME/.nodebrew/node/v25.9.0/bin:$PATH"
npm run build -w packages/core && npm run build -w packages/gui
```
