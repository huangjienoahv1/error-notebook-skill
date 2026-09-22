# 安装与私有数据

仅在安装、迁移、定位数据文件或维护公开代码时读取。这里的命令以 Skill 根目录为工作目录；从其他目录执行时使用脚本绝对路径。

## 数据路径优先级

检索、校验和扫描显式传入 `--notebook` 时使用该文件，文件必须已经存在；不会为显式路径自动初始化。未传入时依次选择：

1. `ERROR_NOTEBOOK_PATH`。
2. 兼容变量 `CODEX_ERROR_NOTEBOOK_PATH`。
3. 已存在的 `~/.error-notebook/error-notebook.md`。
4. 已存在的旧版 `~/.codex/error-notebook-data/error-notebook.md`。
5. 新建 `~/.error-notebook/error-notebook.md`。

环境变量和 `--notebook` 建议使用绝对路径；相对路径按进程工作目录解析。环境变量支持 `~` 主目录缩写，`--notebook` 不由脚本展开该缩写，不应依赖不同 Shell 的展开行为。

运行 `node scripts/init-private-notebook.mjs` 查看实际路径并初始化缺失的默认文件；该命令使用环境变量选择路径，不接收 `--notebook`。复制模板时不覆盖已有数据。如果变量指向公开模板或公开仓库，先为当前调用设置仓库外的私有目标，再运行初始化；初始化器本身不负责自动纠正错误配置。

目录链接只共享 Skill 代码，真实错题保存在私有文件。Skill 安装目录只读时，仍可读写有权限的外部私有文件。旧文件继续沿用，不自动搬迁或覆盖。

## 开发者链接安装

用户要求安装或修复源码链接时，运行 `node scripts/install-skill.mjs`。默认链接到 `~/.agents/skills/error-notebook`；若已有旧版 `~/.codex/skills/error-notebook`，继续沿用旧位置。Windows 使用 Junction，Linux/macOS 使用目录符号链接。

已有安装目录会先备份，创建失败时尝试恢复；时间戳备份仅用于迁移回滚，不作为后续维护入口。首次检索不需要先运行链接安装器。

## 公开代码检查

公开仓库只保存 Skill、脚本、空白模板和不含个人数据的说明。提交前运行 `node scripts/validate-public-repo.mjs`；它扫描 Git 已跟踪文件和未忽略的新文件中的部分高风险内容，不代替人工核对敏感信息。

私有错题保存与公开仓库的 Git 提交、推送相互独立。跨设备同步个人错题应使用用户选定的私有存储，不能复制到公开仓库。
