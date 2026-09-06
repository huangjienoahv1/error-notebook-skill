#!/usr/bin/env python3
"""校验错误经验错题本的结构、编码和高风险敏感信息。"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import date
from pathlib import Path
import re
import sys

from notebook_lifecycle import (
    INACTIVE_VALUE,
    LIFECYCLE_FIELDS,
    MIGRATED_PENDING_VALUES,
    REVIEW_PERIOD_DAYS,
    VALID_STATUSES,
    extract_lifecycle,
    parse_iso_date,
)
from search_notebook import DEFAULT_NOTEBOOK, SPECIAL_SECTIONS, parse_notebook


REQUIRED_PREFIXES = (
    *LIFECYCLE_FIELDS.values(),
    "- 适用条件或错误特征：",
    "- 根因判断：",
    "- 正确处理：",
    "- 禁止做法：",
)
SECRET_PATTERNS = {
    "私钥": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "GitHub Token": re.compile(r"\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"),
    "OpenAI API Key": re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"),
    "AWS Access Key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
}


def find_duplicates(values: list[str]) -> list[str]:
    """返回保持稳定顺序的重复值列表。"""

    counts = Counter(values)
    return list(dict.fromkeys(value for value in values if counts[value] > 1))


def build_parser() -> argparse.ArgumentParser:
    """创建校验命令行参数。"""

    parser = argparse.ArgumentParser(
        description="校验私有错题本或仓库内公开空白模板。"
    )
    parser.add_argument(
        "--notebook",
        type=Path,
        default=DEFAULT_NOTEBOOK,
        help="错题本 Markdown 路径；默认优先使用本机私有数据文件",
    )
    return parser


def validate_lifecycle(
    category: str,
    title: str,
    lines: tuple[str, ...],
    known_entries: set[str],
) -> list[str]:
    """校验一条经验的生命周期字段和值域。"""

    qualified_title = f"{category} / {title}"
    values = extract_lifecycle(lines)
    errors: list[str] = []
    status = values["status"]

    if status not in VALID_STATUSES:
        errors.append(
            f"{qualified_title} 的状态“{status}”无效，应为：{'、'.join(VALID_STATUSES)}。"
        )
        return errors

    if not values["scope"]:
        errors.append(f"{qualified_title} 的适用范围不能为空。")
    if not values["evidence"]:
        errors.append(f"{qualified_title} 的验证证据不能为空。")
    if not values["superseded_by"]:
        errors.append(f"{qualified_title} 的替代条目不能为空；没有替代项时填写“无”。")

    if status == "待复核":
        period = values["review_period"]
        if period not in (*REVIEW_PERIOD_DAYS, MIGRATED_PENDING_VALUES["review_period"]):
            errors.append(f"{qualified_title} 的待复核周期值无效：{period}。")
        last_verified = values["last_verified"]
        if (
            last_verified != MIGRATED_PENDING_VALUES["last_verified"]
            and parse_iso_date(last_verified) is None
        ):
            errors.append(f"{qualified_title} 的最后验证日期无效：{last_verified}。")
        review_by = values["review_by"]
        if (
            review_by != MIGRATED_PENDING_VALUES["review_by"]
            and parse_iso_date(review_by) is None
        ):
            errors.append(f"{qualified_title} 的下次复核日期无效：{review_by}。")
        return errors

    last_verified_date = parse_iso_date(values["last_verified"])
    if last_verified_date is None:
        errors.append(f"{qualified_title} 的最后验证必须是 YYYY-MM-DD：{values['last_verified']}。")
    elif last_verified_date > date.today():
        errors.append(f"{qualified_title} 的最后验证日期不能晚于今天。")

    if status in ("已失效", "已替代"):
        if values["review_period"] != INACTIVE_VALUE:
            errors.append(f"{qualified_title} 已停止生效，复核周期应填写“不适用”。")
        if values["review_by"] != INACTIVE_VALUE:
            errors.append(f"{qualified_title} 已停止生效，下次复核应填写“不适用”。")
        if values["evidence"] == MIGRATED_PENDING_VALUES["evidence"]:
            errors.append(f"{qualified_title} 必须填写确认失效或替代关系的真实证据。")
        if status == "已替代":
            replacement = values["superseded_by"]
            if replacement == "无":
                errors.append(f"{qualified_title} 已替代，但没有填写替代条目。")
            elif replacement not in known_entries:
                errors.append(
                    f"{qualified_title} 的替代条目不存在：{replacement}；请使用“分类 / 标题”。"
                )
        return errors

    if values["review_period"] not in REVIEW_PERIOD_DAYS:
        errors.append(
            f"{qualified_title} 的复核周期“{values['review_period']}”无效，应为 90天、180天或365天。"
        )

    review_by_date = parse_iso_date(values["review_by"])
    if review_by_date is None:
        errors.append(f"{qualified_title} 的下次复核必须是 YYYY-MM-DD：{values['review_by']}。")

    if last_verified_date and review_by_date:
        interval_days = (review_by_date - last_verified_date).days
        if interval_days < 1:
            errors.append(f"{qualified_title} 的下次复核必须晚于最后验证日期。")
        period_days = REVIEW_PERIOD_DAYS.get(values["review_period"])
        if period_days is not None and interval_days > period_days:
            errors.append(
                f"{qualified_title} 的复核间隔为 {interval_days} 天，超过 {period_days} 天周期。"
            )

    if values["evidence"] == MIGRATED_PENDING_VALUES["evidence"]:
        errors.append(f"{qualified_title} 不是待复核状态，必须填写真实验证证据。")
    if values["superseded_by"] != "无":
        errors.append(f"{qualified_title} 仍为有效状态，替代条目应填写“无”。")
    return errors


def main() -> int:
    """执行全部静态校验并返回适合自动化使用的退出码。"""

    notebook = build_parser().parse_args().notebook
    if not notebook.is_file():
        print(f"校验失败：错题本不存在：{notebook}", file=sys.stderr)
        return 2
    raw = notebook.read_bytes()
    errors: list[str] = []

    if raw.startswith(b"\xef\xbb\xbf"):
        errors.append("文件包含 UTF-8 BOM，应保存为 UTF-8 无 BOM。")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        print(f"校验失败：文件不是有效 UTF-8：{exc}", file=sys.stderr)
        return 1

    sections, categories, entries = parse_notebook(text)
    for required_section in SPECIAL_SECTIONS:
        if required_section not in sections:
            errors.append(f"缺少二级章节：{required_section}")

    for duplicate in find_duplicates(categories):
        errors.append(f"重复分类：{duplicate}")

    qualified_titles = [f"{entry.category} / {entry.title}" for entry in entries]
    for duplicate in find_duplicates(qualified_titles):
        errors.append(f"同一分类下存在重复条目：{duplicate}")

    known_entries = set(qualified_titles)
    for entry in entries:
        for prefix in REQUIRED_PREFIXES:
            count = sum(1 for line in entry.lines if line.startswith(prefix))
            if count != 1:
                errors.append(
                    f"{entry.category} / {entry.title} 中“{prefix}”数量为 {count}，应为 1。"
                )
        errors.extend(
            validate_lifecycle(
                entry.category,
                entry.title,
                entry.lines,
                known_entries,
            )
        )

    if "[TODO" in text or "[PLACEHOLDER" in text:
        errors.append("文件仍包含未完成占位符。")

    for secret_name, pattern in SECRET_PATTERNS.items():
        if pattern.search(text):
            errors.append(f"检测到疑似{secret_name}，请删除或脱敏。")

    if errors:
        print("错题本校验失败：", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"错题本校验通过：{len(categories)} 个分类，{len(entries)} 条经验，UTF-8 无 BOM，未发现高风险凭据。"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
