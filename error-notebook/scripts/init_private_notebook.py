#!/usr/bin/env python3
"""从公开空白模板初始化本机私有错题本，绝不覆盖已有数据。"""

from __future__ import annotations

import shutil
import sys

from notebook_paths import BUNDLED_NOTEBOOK, private_notebook_path


def main() -> int:
    """创建私有数据文件并输出实际路径。"""

    target = private_notebook_path()
    if target.exists():
        if not target.is_file():
            print(f"错误：私有错题本路径不是文件：{target}", file=sys.stderr)
            return 2
        print(f"私有错题本已存在，未覆盖：{target}")
        return 0
    if not BUNDLED_NOTEBOOK.is_file():
        print(f"错误：公开模板不存在：{BUNDLED_NOTEBOOK}", file=sys.stderr)
        return 2

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(BUNDLED_NOTEBOOK, target)
    print(f"私有错题本初始化成功：{target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
