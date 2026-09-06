#!/usr/bin/env python3
"""校验公开仓库不包含个人错题、敏感凭据或真实本机路径。"""

from __future__ import annotations

from pathlib import Path
import re
import subprocess
import sys

from notebook_paths import BUNDLED_NOTEBOOK, SKILL_ROOT
from search_notebook import parse_notebook


REPOSITORY_ROOT = SKILL_ROOT.parent
FORBIDDEN_PATTERNS = {
    "Windows 用户目录": re.compile(r"[A-Za-z]:\\Users\\(?!<)[^\\\s`]+"),
    "本机代码目录": re.compile(r"[A-Za-z]:\\(?:code|workspace)\\[^\s`]+", re.IGNORECASE),
    "内网 IPv4 地址": re.compile(
        r"\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b"
    ),
    "私钥": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "GitHub Token": re.compile(
        r"\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"
    ),
    "OpenAI API Key": re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"),
    "AWS Access Key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
}


def repository_files() -> list[Path]:
    """返回已跟踪文件和未忽略的新文件，供提交前检查。"""

    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
    )
    return [
        REPOSITORY_ROOT / item.decode("utf-8")
        for item in result.stdout.split(b"\0")
        if item
    ]


def main() -> int:
    """执行公开仓库隐私检查。"""

    errors: list[str] = []
    template_text = BUNDLED_NOTEBOOK.read_text(encoding="utf-8")
    _, _, template_entries = parse_notebook(template_text)
    if template_entries:
        errors.append(
            f"公开模板包含 {len(template_entries)} 条真实经验；请迁移到私有数据文件。"
        )

    for path in repository_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        relative_path = path.relative_to(REPOSITORY_ROOT)
        for pattern_name, pattern in FORBIDDEN_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"{relative_path} 检测到{pattern_name}。")

    if errors:
        print("公开仓库校验失败：", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("公开仓库校验通过：公开模板为空，已跟踪文件未发现高风险凭据或个人绝对路径。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
