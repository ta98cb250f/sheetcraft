#!/usr/bin/env python3
"""Stop hook — assistant の最終応答に造語 / 略語 / 不明瞭なカタカナ語が
含まれていたら WARN リマインダを出す。

検出対象 (いずれも exit 0 + stderr WARN):
  - 「コミュ」(末尾が「ニ」以外) — カテゴリ略記 (「コミュニケーション」は除外)
  - 「HMR」 — hot module replacement の略
  - 「型タグ」 — Claude の独自造語
  - 「placement」「placeholder」 — 混同しやすいカタカナ / 英単語

CLAUDE.md「よくある介入パターン #2」と既存メモリ feedback_communication_style
の遵守不足で複数回再発しているため、機械検出で次出力での言い換えを促す。

transcript JSONL を読めない / フォーマットが異なる場合は黙って exit 0
(fail-safe)。検出メッセージは「次回出力で正式名・定義に置き換える」よう促す。
"""
import json
import re
import sys
from pathlib import Path

NG_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"コミュ(?!ニ)"), "「コミュ」(略記。「コミュニケーション」と書く)"),
    (re.compile(r"\bHMR\b"), "「HMR」(略語。「hot module replacement」と書く)"),
    (re.compile(r"型タグ"), "「型タグ」(独自造語。具体的なフィールド名 / 型名を使う)"),
    (re.compile(r"\bplacement\b", re.IGNORECASE), "「placement」(カタカナ精度。文脈に応じ「配置」「位置」等に置換)"),
    (re.compile(r"\bplaceholder\b", re.IGNORECASE), "「placeholder」(カタカナ精度。文脈に応じ「プレースホルダ」「仮置き」等に置換)"),
]


def extract_last_assistant_text(transcript_path: str) -> str:
    text_parts: list[str] = []
    path = Path(transcript_path)
    if not path.is_file():
        return ""
    try:
        with path.open(encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return ""

    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg = entry.get("message") or entry
        role = msg.get("role") or entry.get("role")
        if role != "assistant":
            continue
        content = msg.get("content")
        if isinstance(content, str):
            text_parts.append(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
        break

    return "\n".join(text_parts)


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    transcript_path = data.get("transcript_path", "")
    if not transcript_path:
        return 0

    text = extract_last_assistant_text(transcript_path)
    if not text:
        return 0

    hits: list[str] = []
    for pattern, label in NG_PATTERNS:
        if pattern.search(text):
            hits.append(label)

    if not hits:
        return 0

    print(
        "WARN: 直前の応答に造語 / 略語 / 精度の低いカタカナ語が含まれます: "
        + " / ".join(hits)
        + "。次回の出力では正式名で書くか、初出時に 1 行で定義してください "
        "(CLAUDE.md「よくある介入パターン」#2)。",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
