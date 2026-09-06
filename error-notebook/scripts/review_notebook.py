#!/usr/bin/env python3
"""扫描待复核和已经超过复核日期的错误经验。"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import date
from pathlib import Path
import sys

from notebook_lifecycle import extract_lifecycle, lifecycle_label
from search_notebook import DEFAULT_NOTEBOOK, parse_notebook


def parse_as_of(value: str) -> date:
    """把命令行日期解析为 ISO 日期。"""

    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("日期必须使用 YYYY-MM-DD 格式。") from exc


def build_parser() -> argparse.ArgumentParser:
    """创建复核扫描命令行参数。"""

    parser = argparse.ArgumentParser(
        description="报告待复核或已超过复核日期的错误经验，不修改错题本。"
    )
    parser.add_argument(
        "--notebook",
        type=Path,
        default=DEFAULT_NOTEBOOK,
        help="错题本 Markdown 路径",
    )
    parser.add_argument(
        "--as-of",
        type=parse_as_of,
        default=date.today(),
        help="扫描基准日期，格式 YYYY-MM-DD，默认今天",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=20,
        help="最多显示的待处理条目数，默认 20",
    )
    parser.add_argument(
        "--fail-on-action",
        action="store_true",
        help="存在待复核或已到期条目时返回退出码 1",
    )
    return parser


def main() -> int:
    """输出生命周期汇总和需要处理的条目。"""

    args = build_parser().parse_args()
    if args.max_results < 1:
        print("错误：--max-results 必须大于 0。", file=sys.stderr)
        return 2
    if not args.notebook.is_file():
        print(f"错误：错题本不存在：{args.notebook}", file=sys.stderr)
        return 2

    text = args.notebook.read_text(encoding="utf-8")
    _, _, entries = parse_notebook(text)
    labels = [(lifecycle_label(entry.lines, args.as_of), entry) for entry in entries]
    counts = Counter(label for label, _ in labels)
    actionable = [item for item in labels if item[0] in ("待复核", "已到期")]

    print(f"# 错题本复核扫描（截至 {args.as_of.isoformat()}）")
    print()
    print(f"- 总条目：{len(entries)}")
    for label in ("有效", "待复核", "已到期", "已失效", "已替代"):
        print(f"- {label}：{counts[label]}")

    print("\n## 待处理条目\n")
    if not actionable:
        print("没有待复核或已到期条目。")
        return 0

    for label, entry in actionable[: args.max_results]:
        values = extract_lifecycle(entry.lines)
        print(
            f"- [{label}] {entry.category} / {entry.title}；"
            f"最后验证：{values['last_verified']}；下次复核：{values['review_by']}"
        )
    remaining = len(actionable) - args.max_results
    if remaining > 0:
        print(f"- 其余 {remaining} 条未展开；使用 --max-results 调整显示数量。")

    return 1 if args.fail_on_action else 0


if __name__ == "__main__":
    raise SystemExit(main())
