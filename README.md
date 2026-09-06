# 错误经验错题本 Agent Skill

把已验证的跨项目错误经验做成可检索、可维护的通用 Agent Skill。它会在技术任务开始时按需查找历史经验，在发生失败或用户纠正后用准确错误再次检索，并且只在根因已确认、解决方式已验证时沉淀新经验。

## 目录

```text
package.json
error-notebook/
├─ SKILL.md
├─ agents/openai.yaml
├─ references/error-notebook.md      # 公开空白模板
└─ scripts/
   ├─ install-skill.mjs
   ├─ init-private-notebook.mjs
   ├─ notebook-lifecycle.mjs
   ├─ notebook-parser.mjs
   ├─ notebook-paths.mjs
   ├─ review-notebook.mjs
   ├─ search-notebook.mjs
   ├─ validate-public-repo.mjs
   └─ validate-notebook.mjs
```

Skill 自身运行需要 Node.js 18 或更高版本，不依赖 Python、PowerShell 或第三方 npm 包。普通用户通过 `npx skills` 安装时建议使用 Node.js 24 或更高版本，以满足当前 Skills CLI 的运行要求。

## 普通用户安装

Node.js 24 或更高版本环境中，一条命令全局安装，Skills CLI 会自动识别当前支持的 Agent：

```shell
npx skills add huangjienoahv1/error-notebook-skill --skill error-notebook --global --yes
```

需要明确安装到多个 Agent 时，可以按需列出目标，例如：

```shell
npx skills add huangjienoahv1/error-notebook-skill --skill error-notebook --agent codex claude-code cursor --global --yes
```

当前 Skills CLI 会把通用Skill安装到 `~/.agents/skills/error-notebook`，并为选中的 Agent 配置对应入口。安装后重新打开正在使用的 Agent；第一次检索、校验或复核时，会自动在 `~/.error-notebook/error-notebook.md` 创建私有错题本。公开仓库中的模板始终保持为空，已有私有文件绝不会被覆盖。

## 开发者链接安装

把仓库克隆到不会被临时清理的稳定目录：

```shell
git clone https://github.com/huangjienoahv1/error-notebook-skill.git
cd error-notebook-skill
```

使用统一的 Node.js 安装器，让全局 Skill 通过目录链接使用仓库中的代码，同时在仓库外初始化私有错题本：

```shell
node ./error-notebook/scripts/install-skill.mjs
```

安装器默认把源码链接安装到通用目录 `~/.agents/skills/error-notebook`：Windows 创建 Junction，Linux 和 macOS 创建目录符号链接。如果检测到旧版 `~/.codex/skills/error-notebook` 已经存在，会继续沿用旧位置，避免产生重复Skill。已有目录会先移动到同一配置根目录的 `skill-backups` 下保存，创建失败时尝试恢复，不会直接删除既有内容。私有错题本已存在时不会覆盖。

开发者更新仓库后，目录链接会立即使用新代码；普通用户可以运行 `npx skills update -g error-notebook` 更新已安装副本。

新安装完成后：

- `~/.agents/skills/error-notebook` 指向仓库内的 Skill 代码；
- 真实错题保存在 `~/.error-notebook/error-notebook.md`；
- 可以用 `ERROR_NOTEBOOK_PATH` 改为其他私有位置；
- 已有旧版 Codex Skill 和私有错题路径会继续使用，不迁移、不覆盖。

重新打开 Agent 后，可以要求它：

```text
使用 error-notebook 检索这个 Maven 构建错误，并在确认根因和验证修复后记录经验。
```

Skill遵循开放Agent Skills目录结构并允许自动发现；涉及修改项目、全局规则或远端仓库的动作仍需遵循当前任务授权。

## 更新与 GitHub 同步

- 本地经验满足写入门槛后，只更新仓库外的私有错题本。
- GitHub 仓库只同步 Skill、脚本、空白模板和公开说明，不同步真实错题。
- 提交前运行公开仓库校验，防止个人路径、内网地址、凭据或真实条目被误提交。
- 如果需要跨设备同步个人错题，应使用单独的私有仓库或加密备份，不要复用这个公开仓库。
- 迁移前的时间戳目录和旧全局经验文件仅作为备份，不作为默认维护入口。

## 独立检索与校验

```shell
node ./error-notebook/scripts/init-private-notebook.mjs
node ./error-notebook/scripts/search-notebook.mjs 'PowerShell' 'Missing closing'
node ./error-notebook/scripts/validate-notebook.mjs
node ./error-notebook/scripts/review-notebook.mjs
node ./error-notebook/scripts/validate-public-repo.mjs
```

检索、错题校验和复核脚本默认使用私有数据文件；文件尚不存在时会从公开空白模板安全初始化。检索结果如果命中待复核、已到期、已失效或已替代条目，会明确提示只能作为调查线索。公开仓库校验要求随仓库提供的模板不含任何真实条目，并扫描已跟踪文件中的高风险凭据、个人绝对路径和内网地址。

复核扫描脚本只报告待复核和已经超过复核日期的条目，不会自动修改或删除内容。建议每月运行一次：

```shell
node ./error-notebook/scripts/review-notebook.mjs --max-results 30
```

在 CI 或计划任务中需要用退出码识别待处理项时，可以增加 `--fail-on-action`。

## 生命周期与复核周期

- 工具、API、框架和云服务：90 天。
- 操作系统、构建和部署环境：180 天。
- Git、安全边界和稳定操作原则：365 天。
- 每次实际命中某条经验时，无论是否到期，都优先在当前环境复核。
- 到期只表示需要重新确认，不表示原经验必然错误；验证失败后标记为 `已失效` 或 `已替代`，保留历史关系。
- 已失效或已替代条目不再安排周期复核，但必须保留确认日期和证据。
- 迁移前没有可靠日期和证据的旧条目统一标记为 `待复核`，首次命中时再补充真实日期、周期和证据。

## 设计取舍

本 Skill 参考了 GitHub 上几类公开实践，但保持轻量和证据优先：

- [Skiller](https://github.com/markdav-is/Skiller/blob/main/SKILL.md)：采用“可复用、非显然、具体、已验证”的经验筛选标准。
- [Lessons Learned](https://github.com/aplaceforallmystuff/claude-lessons-learned)：吸收根因、改进动作和验证闭环，不强制每条经验都写完整事故时间线。
- [Systematic Debugging](https://github.com/magnus919/agent-skills/blob/main/systematic-debugging/SKILL.md)：保留准确错误、根因优先和当前环境复核原则。
- [Error Knowledge Base](https://gist.github.com/alexishida/59ee86fc8e1d939cf75c97f38b132dec)：借鉴症状、根因、修复和预防的结构，但拒绝未经验证的自动写入。
- [Apple Skills](https://github.com/rshankras/claude-code-apple-skills/blob/main/skills/shared/skill-creator/SKILL.md)：采用 `last_verified` 和 `review_by` 的轻量复核机制。
- [Aerospike Agent Skills](https://github.com/aerospike/agent-skills/blob/main/CONTRIBUTING.md)：采用单一权威来源，并在人工复核后更新验证日期。

错题本不是通用调试教程，也不是项目业务知识库。一次性外部状态、推测、隐私和凭据都不应进入其中。
