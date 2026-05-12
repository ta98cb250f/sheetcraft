---
name: pre-implement-check
description: コード変更に着手する前のチェックリスト。新規ブランチ作業・新機能着手・外部コマンド案内の前に必ず通す。「実装を始める」「変更する」「新しく作る」と言う前に発火。
version: 1.0.0
---

# Pre-Implement Check Skill

介入ログから抽出した「着手前に怠ると手戻りになる」項目を機械的にチェックする。CLAUDE.md §実装方針 § 着手宣言の前段として使う。

## 使い方

```bash
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

echo "=== 1. ブランチ状態 ==="
echo "現在ブランチ: $(git rev-parse --abbrev-ref HEAD)"
echo "untracked / 未ステージ:"
git status --short
echo ""
echo "develop からの差分コミット数: $(git rev-list --count origin/develop..HEAD 2>/dev/null || echo '?')"
echo "develop の最新を取得しているか (fetch から経過):"
stat -f "%Sm" -t "%Y-%m-%d %H:%M" .git/FETCH_HEAD 2>/dev/null || echo "未 fetch"

echo ""
echo "=== 2. 介入ログの関連事例 ==="
echo "(該当領域のキーワードで grep し、過去の地雷を確認すること)"
echo "例: grep -n 'AG Grid' .claude/notes/intervention-log.md"
```

## 着手宣言の前に確認する項目

### A. ブランチ判断
- [ ] 現ブランチで作業して良いか（コード本筋 vs 運用 / ドキュメント / スキル変更で分けるべきか）
- [ ] 新ブランチを切る場合: `git fetch origin && git checkout -b <name> origin/develop` で最新ベースから切る
- [ ] `git status` で untracked / 未ステージを点検（コミット時に巻き込み事故を防ぐ）

### B. 前提ツール / 仕様
- [ ] 案内するコマンドの存在を `which <tool>` で先に検証（過去に gh / brew 未確認で案内した事例あり）
- [ ] `gh` サブコマンドは `gh <cmd> --help` で実在確認（`gh milestone list` が存在しない事例あり）
- [ ] UI 配置指示なら `/find-component` を先に通す
- [ ] AG Grid 機能なら `/check-agrid-community <機能名>` を先に通す

### C. 介入ログ参照
- [ ] 似た領域の過去事例を `.claude/notes/intervention-log.md` で grep（カテゴリ・キーワード）
- [ ] 該当する地雷があれば回避策を着手宣言の §根拠 に明示

### D. 範囲確認
- [ ] 「進めて」「やって」など広い指示なら、最小 1 ステップに区切ってユーザー確認
- [ ] 複数論点を 1 度に走らせない

## 省略可な場合

- 1 ファイル・タイポ・コメント修正レベル
- 直前のターンで同じ範囲を確認済み

省略する場合は「pre-implement-check 省略：理由」を 1 行で出す。
