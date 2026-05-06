---
name: pr-metadata
description: This skill MUST be used whenever creating a GitHub pull request with `gh pr create`. It ensures PRs always have labels, milestones, and assignees set correctly. Use this skill when the user asks to "create a PR", "open a pull request", "make a PR", "submit a PR", "プルリクエストを作成", "PRを作る", or any time `gh pr create` would be run.
version: 1.0.0
---

# PR Metadata Skill

Every PR created via `gh pr create` must have labels, milestones, and assignees correctly set. This skill defines how to gather that information and apply it.

## 原則

**ラベル・マイルストーン・アサイニーはすべて必須。いずれか1つでも設定できない場合は PR を作成しない。自動判定できないものはユーザーに相談し、合意を得てから作成すること。**

## Step-by-step process

### 1. Gather repo metadata (run all in parallel)

**注意**: git remote がローカルプロキシ経由の場合、`gh` サブコマンドには `--repo {owner}/{repo}` が必須。`gh api` は URL 直指定のため不要。

```bash
gh label list --repo {owner}/{repo} --limit 50 --json name,color,description
gh api repos/{owner}/{repo}/milestones --jq '[.[] | select(.state=="open") | {title: .title, number: .number}]'
gh api repos/{owner}/{repo} --jq '{owner: .owner.login, default_branch: .default_branch}'
gh api user --jq '.login' 2>/dev/null
```

### 2. Determine assignee

Use the GitHub login from `gh api user` if available. Otherwise fall back to the repository owner from `gh api repos/{owner}/{repo}`.

### 3. Infer labels from context

Use the following signals to select labels from what actually exists in the repo (never invent labels):

| Signal | Look for labels like... |
|--------|------------------------|
| Branch name contains `feat/` or `feature/` | `enhancement`, `feature` |
| Branch name contains `fix/` or `bugfix/` | `bug`, `fix` |
| Branch name contains `docs/` | `documentation`, `docs` |
| Branch name contains `refactor/` | `refactor` |
| Branch name contains `test/` | `test` |
| Changed files under `packages/gui/` | `gui`, `frontend` |
| Changed files under `packages/core/` | `core` |
| Changed files under `packages/cli/` | `cli` |
| Commit messages contain "fix" / "bug" | `bug` |
| Commit messages contain "feat" | `enhancement`, `feature` |
| Only docs/config changed | `documentation` |

Only select labels that exist in the repo. **ラベルが1つも特定できない場合は PR を作成せず、ユーザーに候補を提示して選択を求めること。**

### 4. Determine milestone

If there are open milestones, pick the one most relevant to the branch or PR content. If only one exists, use it. **オープンなマイルストーンが存在しない場合、または適切なものが判断できない場合は、PR を作成せずにユーザーへ確認すること（新規作成するか、マイルストーンなしで進めるかを明示的に合意を得る）。**

### 5. Determine base branch

Step 1 で取得した `default_branch` をマージ先に使う。特別な指示がない限りハードコードしない。

### 6. Build and run the `gh pr create` command

`gh pr create` も `--repo` フラグが必要。ただし git remote がプロキシ経由の場合は失敗することがあるため、失敗時は MCP の `mcp__github__create_pull_request` にフォールバックする。

```bash
gh pr create \
  --repo {owner}/{repo} \
  --title "<title>" \
  --body "<body>" \
  --base <default_branch> \
  --assignee <github-login> \
  [--label "<label1>" --label "<label2>"] \
  [--milestone "<milestone-title>"]
```

- **`--assignee` は必須**。取得できない場合はユーザーに確認する
- **`--label` は必須**。自動判定できない場合は PR を作成せずユーザーに確認する
- **`--milestone` は必須**。存在しない・判断できない場合はユーザーに確認し、明示的に「なしで進める」合意を得た場合のみ省略可
- Multiple labels require multiple `--label` flags (not comma-separated)
- **PR 作成後の更新**: `gh pr edit` は Projects classic の deprecation エラーで失敗する。PR 本文等の更新には `gh api repos/{owner}/{repo}/pulls/<番号> --method PATCH` を使うこと

## `gh` が使えない環境でのフォールバック

`gh` コマンドが存在しない場合は MCP ツールで代替する：

| 目的 | MCP ツール |
|------|-----------|
| ラベル一覧取得 | `mcp__github__get_label`（候補名を個別に確認）|
| マイルストーン取得 | GitHub API 経由（MCP に専用ツールがなければユーザーに確認）|
| ユーザー取得 | `mcp__github__get_me` |
| PR 作成 | `mcp__github__create_pull_request` |
| ラベル・アサイニー設定 | `mcp__github__issue_write`（PR 番号を issue_number に指定）|

## Example

```bash
# Labels available: bug, enhancement, documentation, gui, core, cli
# Milestones available: Phase 1
# Branch: feature/inline-editing
# Changed files: packages/gui/src/...
# Default branch: develop  ← gh api repos/ta98cb250f/sheetcraft --jq '.default_branch' で確認

gh pr create \
  --repo ta98cb250f/sheetcraft \
  --title "Add inline cell editing to TableView" \
  --body "..." \
  --base develop \
  --assignee ta98cb250f \
  --label "enhancement" \
  --label "gui" \
  --milestone "Phase 1"
```
