---
name: commit
description: 変更を commit する。Co-Authored-By タグを必ず付ける。「コミット」「commit」と言われたら使用する。
version: 1.0.0
---

# Commit Skill

変更を Co-Authored-By タグ付きで commit する。

## 手順

1. `git status` と `git diff` で変更内容を確認
2. 変更の性質（feat / fix / refactor / docs など）を判断してメッセージを作成
3. ステージしてコミットする（HEREDOC でメッセージを渡す）

```bash
git add <変更ファイル>
git commit -m "$(cat <<'EOF'
<type>: <要約>

<本文>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

## ルール

- ユーザーが明示的にコミットを指示するまで自発的にコミットしない
- `git add -A` や `git add .` は使わず、対象ファイルを明示する
- 機密情報を含むファイル（`.env`, credentials など）は除外する
- 直前のコミットへの `--amend` は禁止。失敗時は新規コミットを作る
- pre-commit hook を `--no-verify` でスキップしない
