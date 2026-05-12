#!/usr/bin/env python3
"""PreToolUse hook — 介入ログから抽出した再発パターンを検出してブロックする。

検出対象:
  1. メモリディレクトリ (~/.claude/projects/*/memory/) への Write / Edit
     → ユーザー事前確認なしの書き込みを阻止 (feedback_memory_confirm.md)
  2. Write で空ファイル (content が空 or 空白のみ)
     → 「追加候補ゼロなのに空 settings.json 作成」事例の再発防止
  3. Edit で replace_all=true かつ old_string が短い (30 文字未満)
     → 前方一致衝突による二重置換 (「コミュニケーションニケーション」事例) 防止

exit 2 でツール実行をブロックし、stderr の内容を Claude に伝える。
"""
import json
import sys

REPLACE_ALL_MIN_LEN = 30


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    tool_name = data.get("tool_name", "")
    if tool_name not in ("Write", "Edit"):
        return 0

    tool_input = data.get("tool_input", {})
    file_path = tool_input.get("file_path", "")

    if "/.claude/projects/" in file_path and "/memory/" in file_path:
        print(
            "WARN: メモリディレクトリへの書き込みです。"
            "保存内容と可否をユーザーに先に提示して承認を得たか再確認してください "
            "(memory/feedback_memory_confirm.md)。承認済みなら続行可。",
            file=sys.stderr,
        )
        return 0

    if tool_name == "Write":
        content = tool_input.get("content", "")
        if not content.strip():
            print(
                "BLOCK: 空ファイル / 空白のみのファイルの新規作成は禁止です。"
                "本当に必要か再確認してください "
                "(`/fewer-permission-prompts` で空 settings.json 作成した事例の再発防止)。",
                file=sys.stderr,
            )
            return 2

    if tool_name == "Edit":
        if tool_input.get("replace_all") is True:
            old_string = tool_input.get("old_string", "")
            if len(old_string) < REPLACE_ALL_MIN_LEN:
                print(
                    f"BLOCK: replace_all で old_string が短すぎます ({len(old_string)} 文字 < {REPLACE_ALL_MIN_LEN})。"
                    "前方一致衝突で二重置換になる恐れがあります "
                    "(「コミュニケーションニケーション」事例)。"
                    "grep で全箇所を確認し、ユニークな長い文脈に拡張してから再実行してください。",
                    file=sys.stderr,
                )
                return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
