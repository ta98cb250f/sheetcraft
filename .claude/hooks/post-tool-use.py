#!/usr/bin/env python3
"""PostToolUse hook — 不可逆操作の完了を明示報告するようリマインドする。

検出対象 (いずれも exit 0 + stderr WARN):
  1. Bash で `git push`, `gh pr create`, `gh api ... pulls ... --method (PATCH|POST|PUT|DELETE)`,
     `gh issue create|close|comment` 等の不可逆 / 外部影響のあるコマンド
  2. mcp__github__ の write 系 (create_*, update_*, merge_*, push_files, enable_*,
     disable_*, add_*, delete_*, resolve_*, unresolve_*, issue_write,
     sub_issue_write, pull_request_review_write, request_copilot_review)

WARN メッセージで「○○済みと明示報告したか」を問い、Claude が次ターンで
完了報告を組み立てるよう促す。read 系の MCP / 通常 Bash は無視する。
"""
import json
import re
import sys

BASH_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bgit\s+push\b"), "git push"),
    (re.compile(r"\bgh\s+pr\s+create\b"), "gh pr create"),
    (re.compile(r"\bgh\s+pr\s+merge\b"), "gh pr merge"),
    (re.compile(r"\bgh\s+pr\s+close\b"), "gh pr close"),
    (re.compile(r"\bgh\s+pr\s+comment\b"), "gh pr comment"),
    (re.compile(r"\bgh\s+pr\s+review\b"), "gh pr review"),
    (re.compile(r"\bgh\s+issue\s+(create|close|reopen|comment|edit)\b"), "gh issue 書込み"),
    (re.compile(r"\bgh\s+api\b.*--method\s+(POST|PATCH|PUT|DELETE)\b"), "gh api 書込み"),
]

MCP_WRITE_PREFIXES = (
    "mcp__github__create_",
    "mcp__github__update_",
    "mcp__github__merge_",
    "mcp__github__push_",
    "mcp__github__enable_",
    "mcp__github__disable_",
    "mcp__github__add_",
    "mcp__github__delete_",
    "mcp__github__resolve_",
    "mcp__github__unresolve_",
    "mcp__github__fork_",
    "mcp__github__run_",
)

MCP_WRITE_EXACT = {
    "mcp__github__issue_write",
    "mcp__github__sub_issue_write",
    "mcp__github__pull_request_review_write",
    "mcp__github__request_copilot_review",
}


def detect_bash_op(command: str) -> str | None:
    for pattern, label in BASH_PATTERNS:
        if pattern.search(command):
            return label
    return None


def detect_mcp_op(tool_name: str) -> str | None:
    if tool_name in MCP_WRITE_EXACT:
        return tool_name
    if tool_name.startswith(MCP_WRITE_PREFIXES):
        return tool_name
    return None


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})

    op = None
    if tool_name == "Bash":
        command = tool_input.get("command", "")
        op = detect_bash_op(command)
    else:
        op = detect_mcp_op(tool_name)

    if op is None:
        return 0

    print(
        f"WARN: 不可逆 / 外部影響のある操作 ({op}) を実行しました。"
        "次のメッセージで完了内容を 1 行で明示報告してください "
        "(例: 「ブランチ X を origin に push 済み」「PR #N を作成」)。"
        "黙ってターンを終えると、ユーザーから「やったなら言って」と指摘されます。",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
