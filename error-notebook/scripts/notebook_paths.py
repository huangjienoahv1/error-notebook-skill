#!/usr/bin/env python3
"""解析公开模板与本机私有错题本的路径。"""

from __future__ import annotations

import os
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
BUNDLED_NOTEBOOK = SKILL_ROOT / "references" / "error-notebook.md"
DEFAULT_PRIVATE_NOTEBOOK = (
    Path.home() / ".codex" / "error-notebook-data" / "error-notebook.md"
)
NOTEBOOK_PATH_ENV = "CODEX_ERROR_NOTEBOOK_PATH"


def private_notebook_path() -> Path:
    """返回环境变量覆盖后的本机私有错题本路径。"""

    configured_path = os.environ.get(NOTEBOOK_PATH_ENV)
    if configured_path:
        return Path(configured_path).expanduser()
    return DEFAULT_PRIVATE_NOTEBOOK


def active_notebook_path() -> Path:
    """优先返回私有错题本；尚未初始化时返回公开空白模板。"""

    private_path = private_notebook_path()
    if private_path.is_file() or os.environ.get(NOTEBOOK_PATH_ENV):
        return private_path
    return BUNDLED_NOTEBOOK
