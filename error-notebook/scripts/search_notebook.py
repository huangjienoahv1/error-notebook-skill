#!/usr/bin/env python3
"""按关键词输出错题本中与当前任务直接相关的上下文。"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date
from pathlib import Path
import sys

from notebook_lifecycle import lifecycle_label
from notebook_paths import active_notebook_path


DEFAULT_NOTEBOOK = active_notebook_path()
SPECIAL_SECTIONS = ("使用方式", "记录规范")


@dataclass(frozen=True)
class Entry:
    """一条带所属分类的错误经验。"""

    category: str
    title: str
    lines: tuple[str, ...]

    @property
    def text(self) -> str:
        """返回用于检索和展示的完整条目文本。"""

        return "\n".join(self.lines)


def parse_notebook(text: str) -> tuple[dict[str, list[str]], list[str], list[Entry]]:
    """解析二级分类和三级经验条目。"""

    sections: dict[str, list[str]] = {}
    categories: list[str] = []
    entries: list[Entry] = []
    current_section: str | None = None
    current_entry_title: str | None = None
    current_entry_lines: list[str] = []

    def flush_entry() -> None:
        """把当前三级标题及正文保存为经验条目。"""

        nonlocal current_entry_title, current_entry_lines
        if current_section and current_entry_title:
            entries.append(
                Entry(current_section, current_entry_title, tuple(current_entry_lines))
            )
        current_entry_title = None
        current_entry_lines = []

    for line in text.splitlines():
        if line.startswith("## "):
            flush_entry()
            current_section = line[3:].strip()
            sections.setdefault(current_section, [line])
            if current_section not in SPECIAL_SECTIONS:
                categories.append(current_section)
            continue

        if line.startswith("### ") and current_section not in SPECIAL_SECTIONS:
            flush_entry()
            current_entry_title = line[4:].strip()
            current_entry_lines = [line]
            continue

        if current_entry_title:
            current_entry_lines.append(line)
        elif current_section:
            sections[current_section].append(line)

    flush_entry()
    return sections, categories, entries


def score_entry(entry: Entry, terms: list[str]) -> int:
    """优先按命中的不同检索词数量和具体程度计算相关度。"""

    haystack = f"{entry.category}\n{entry.title}\n{entry.text}".casefold()
    score = 0
    for term in terms:
        normalized_term = term.casefold().strip()
        if not normalized_term:
            continue
        occurrence_count = haystack.count(normalized_term)
        if occurrence_count:
            # 多命中一个独立条件比重复出现通用词更重要；长错误短语再获得小幅加权。
            score += 1000 + min(occurrence_count, 10) + min(len(normalized_term), 100)
    return score


def build_parser() -> argparse.ArgumentParser:
    """创建命令行参数解析器。"""

    parser = argparse.ArgumentParser(
        description="按技术栈、工具或准确错误文本检索错误经验错题本。"
    )
    parser.add_argument("terms", nargs="+", help="一个或多个字面量检索词")
    parser.add_argument(
        "--notebook",
        type=Path,
        default=DEFAULT_NOTEBOOK,
        help="错题本 Markdown 路径",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=8,
        help="最多输出的经验条数，默认 8",
    )
    return parser


def main() -> int:
    """读取错题本并输出受限的相关上下文。"""

    args = build_parser().parse_args()
    if args.max_results < 1:
        print("错误：--max-results 必须大于 0。", file=sys.stderr)
        return 2
    if not args.notebook.is_file():
        print(f"错误：错题本不存在：{args.notebook}", file=sys.stderr)
        return 2

    text = args.notebook.read_text(encoding="utf-8")
    sections, categories, entries = parse_notebook(text)
    ranked = sorted(
        ((score_entry(entry, args.terms), index, entry) for index, entry in enumerate(entries)),
        key=lambda item: (-item[0], item[1]),
    )
    matches = [entry for score, _, entry in ranked if score > 0][: args.max_results]

    print("# 错题本检索上下文")
    for section_name in SPECIAL_SECTIONS:
        section = sections.get(section_name)
        if section:
            print()
            print("\n".join(section).rstrip())

    print("\n## 分类索引\n")
    for category in categories:
        print(f"- {category}")

    print("\n## 匹配经验\n")
    if not matches:
        print("未检索到直接相关经验；继续当前任务，不读取无关条目。")
        return 0

    for entry in matches:
        print(f"<!-- 分类：{entry.category} -->")
        current_lifecycle = lifecycle_label(entry.lines, date.today())
        if current_lifecycle != "有效":
            print(
                f"<!-- 生命周期：{current_lifecycle}；仅作为调查线索，采用前必须在当前环境复核。 -->"
            )
        print(entry.text.rstrip())
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
