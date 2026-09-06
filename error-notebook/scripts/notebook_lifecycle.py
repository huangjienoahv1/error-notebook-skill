#!/usr/bin/env python3
"""错误经验条目的生命周期字段与到期判断。"""

from __future__ import annotations

from datetime import date


LIFECYCLE_FIELDS = {
    "status": "- 状态：",
    "review_period": "- 复核周期：",
    "scope": "- 适用范围：",
    "last_verified": "- 最后验证：",
    "review_by": "- 下次复核：",
    "evidence": "- 验证证据：",
    "superseded_by": "- 替代条目：",
}
VALID_STATUSES = ("有效", "待复核", "已失效", "已替代")
REVIEW_PERIOD_DAYS = {"90天": 90, "180天": 180, "365天": 365}
INACTIVE_VALUE = "不适用"
MIGRATED_PENDING_VALUES = {
    "review_period": "待首次复核时确定",
    "last_verified": "未记录（迁移存量）",
    "review_by": "首次命中时",
    "evidence": "待复核后补充",
}


def extract_lifecycle(lines: tuple[str, ...]) -> dict[str, str]:
    """从条目正文提取生命周期字段，未出现的字段返回空字符串。"""

    values = {name: "" for name in LIFECYCLE_FIELDS}
    for line in lines:
        for name, prefix in LIFECYCLE_FIELDS.items():
            if line.startswith(prefix):
                values[name] = line[len(prefix) :].strip()
                break
    return values


def parse_iso_date(value: str) -> date | None:
    """解析 ISO 日期；无效或非日期占位值返回 None。"""

    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def lifecycle_label(lines: tuple[str, ...], as_of: date | None = None) -> str:
    """返回用于检索和复核报告的当前生命周期标签。"""

    current_date = as_of or date.today()
    values = extract_lifecycle(lines)
    status = values["status"] or "待复核"
    if status == "有效":
        review_by = parse_iso_date(values["review_by"])
        if review_by is not None and review_by < current_date:
            return "已到期"
    return status
