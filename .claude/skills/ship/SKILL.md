---
name: ship
description: ビルド・テストを通してからリモートにプッシュし、PR を作成または更新する。「ship」「リリース」「PR を出す」「PR を更新」と言われたら使用する。
version: 1.0.0
---

# Ship Skill

変更を出荷可能な状態にしてリモートに反映させる。

## 手順

1. ビルド: `build` スキル相当（core + GUI）
2. テスト: `test` スキル相当（core）
3. コミットされていない変更があれば `commit` スキルでコミット
4. リモートにプッシュ
5. PR が未作成なら `pr-metadata` スキルに従って `gh pr create`、既存なら更新

```bash
export PATH="$HOME/.nodebrew/node/v25.9.0/bin:$PATH"

# 1. build
npm run build -w packages/core && npm run build -w packages/gui || exit 1

# 2. test
npm test -w packages/core || exit 1

# 3. push
git push origin "$(git branch --show-current)"

# 4. PR (作成 or 表示)
gh pr view --repo ta98cb250f/sheetcraft 2>/dev/null || \
  echo "PR がまだない場合は pr-metadata スキルに従って作成すること"
```

## ルール

- ビルド失敗・テスト失敗時は中断する
- 未コミットの変更がある場合は事前に `commit` スキルでコミットしておく
- PR の新規作成時は **必ず** `pr-metadata` スキルを使う（ラベル・マイルストーン・アサイニーを設定）
