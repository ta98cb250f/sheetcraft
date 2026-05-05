---
name: pr-metadata
description: This skill MUST be used whenever creating a GitHub pull request with `gh pr create`. It ensures PRs always have labels, milestones, and assignees set correctly. Use this skill when the user asks to "create a PR", "open a pull request", "make a PR", "submit a PR", "プルリクエストを作成", "PRを作る", or any time `gh pr create` would be run.
version: 1.0.0
---

# PR Metadata Skill

Every PR created via `gh pr create` must have labels, milestones, and assignees correctly set. This skill defines how to gather that information and apply it.

## Step-by-step process

### 1. Gather repo metadata (run all three in parallel)

```bash
gh label list --limit 50 --json name,color,description
gh milestone list --json title,number,state --state open
gh api repos/{owner}/{repo} --jq '.owner.login'
```

Also get the current git user:
```bash
git config user.name
git config user.email
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

Only select labels that exist in the repo. If no label matches, omit `--label`.

### 4. Determine milestone

If there are open milestones, pick the one most relevant to the branch or PR content. If only one exists, use it. If none exist, omit `--milestone`.

### 5. Build and run the `gh pr create` command

Assemble flags based on what was found:

```bash
gh pr create \
  --title "<title>" \
  --body "<body>" \
  --base <base-branch> \
  --assignee <github-login> \
  [--label "<label1>" --label "<label2>"] \
  [--milestone "<milestone-title>"]
```

- Always include `--assignee`
- Include `--label` only if matching labels were found
- Include `--milestone` only if a relevant open milestone exists
- Multiple labels require multiple `--label` flags (not comma-separated)

## Example

```bash
# Labels available: bug, enhancement, documentation, gui, core, cli
# Milestones available: Phase 1
# Branch: feature/inline-editing
# Changed files: packages/gui/src/...

gh pr create \
  --title "Add inline cell editing to TableView" \
  --body "..." \
  --base develop \
  --assignee ta98cb250f \
  --label "enhancement" \
  --label "gui" \
  --milestone "Phase 1"
```
