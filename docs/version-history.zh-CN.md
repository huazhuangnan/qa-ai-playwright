# 版本记录

本页记录当前组件版本和首次提交前的版本规则。
使用步骤见[环境初始化](environment.zh-CN.md)。

## 当前版本

| 组件 | 版本 |
| --- | --- |
| 仓库项目 | 0.0.1 |
| qa-maintainer | 0.0.1 |
| qa-core | 0.0.1 |
| qa-business-guide | 0.0.1 |
| qa-test-design | 0.0.1 |
| qa-api | 0.0.1 |
| qa-web | 0.0.1 |
| qa-triage | 0.0.1 |
| qa-docs | 0.0.1 |
| qa-setup | 0.0.1 |
| Bun | 1.4.4 |
| pnpm | 12.18.0 |
| Playwright CLI 工具 | 0.1.24 |
| Agent Browser 工具 | 0.42.0 |
| cc-switch | 4.0.28 |
| qa-python | 0.0.1 |
| qa-typescript | 0.0.1 |

模板版本：

| 模板 | 版本 |
| --- | --- |
| QA 文档 | 0.0.1 |
| TypeScript 项目 | 0.0.1 |
| Python 项目 | 0.0.1 |

## 版本规则

首次提交前，仓库自有版本固定为 `0.0.1`。
范围包括根项目、builtin Skills、维护 Skill 和项目模板。
此阶段修改内容不递增版本，也不建立虚假的历史版本。
外部 Skill 按需安装，实际来源和版本以项目安装记录为准。
MCP 清单和下载应用继续记录真实上游版本。
首次提交后可再按 SemVer 管理兼容变化。

## 未发布

- 增加 Codex CLI 来源清单。安装和发现共用清单中的包名与命令名，继续复用现有安装并记录实际版本。

- 按 CLI、MCP、Skills、模板和应用资产拆分 packages 目录。入口路径和 QA_REPO 随之调整。旧 MCP 注册不会自动迁移。

- 增加测试任务的 QA 环境检查、初始化与复查引导，并补充正常和失败情景。

- 完善 QA CLI 生命周期管理 TODO，优先安排安装、卸载、删除、升级与失败恢复。补充当前卸载的数据删除范围和待确认决策。

- 修复 qa-core 安装到业务项目后依赖仓库外部文档路径的问题。

- 增加外部 Skill GitHub 来源清单、目录相关提交的只读更新检查及相关文件推送后的 Actions 检查。支持指定清单和分支，不自动应用更新。`qa update check` 覆盖可配置 GitHub 来源的 QA CLI、内置 MCP、外部 Skill、npm 包和 GitHub Release 版本。无有效来源时报告 `unconfigured`。仅在相关文件推送或手动触发时运行检查，不设定时任务。

- 增加只读项目模板升级计划，区分受管文件、用户修改和模板变化。

- 项目卸载保留依赖目录及用户修改，存在保留的受管内容时保留项目记录。

- 环境卸载默认保留环境目录及外部软件，不再交互询问。因无法可靠确认跨环境引用，`--include-external` 暂时拒绝执行。共享软件予以保留。

- 新增 AI 测试整体模型，说明输入、职责路由、API/UI/E2E 层级、主流程图、产出物和结果判定。

- 优化测试设计 Skill 与 QA 文档模板，增加风险追踪、单动作可观测预期、证据要求、稳定性约束、flaky 管理、复测关联和持续迭代字段。

- Codex、CC Switch、Bun、pnpm、Playwright CLI、MCP 和 Agent Browser 优先复用系统或用户级已有安装。缺失时告知并安装到全局或用户级共享位置。

- 新增环境内 QA MCP，提供环境检查、项目管理和可选 MCP 管理工具。

- 调整 CI 范围：运行类型检查、维护单元测试、三平台环境和共享卸载保护。项目生成、项目卸载集成、lint、示例业务测试和兼容版本专项暂未接入。

- 更新 CI 缓存 Action，移除 Node.js 20 运行时警告。

- 将工单示例共享资料迁入示例应用，并将历史执行和缺陷报告归入 TypeScript QA 项目。

- 修复 CI 对 MCP 路径和移除结果的跨平台断言，并检查安装记录已清理。
- 修复 Windows 依赖目录链接测试可能被跳过的问题。
- 修复 Windows 示例 CI 可能掩盖 Python 环境和依赖安装失败的问题。
- 修复 Unix Python 示例 CI 的启动器调用，并扩大环境验证缓存覆盖范围。

- 增加示例应用开发入口和 Python 示例测试入口。
- Python 测试入口使用项目 `.venv`，并透传 pytest 参数。
- 修复 Playwright CLI 实际入口解析，避免按旧版包结构拼接不存在的 `cli.js`。
- 合并仓库级 GitHub Actions 工作流。
- 修复长工作区路径下 Agent Browser 的 Unix socket 超长问题。
- 修复 Chromium 临时目录继承长工作区路径导致的 SingletonSocket 超长问题。
- 修复 Windows Codex MCP 配置中的单引号路径和混合引号数组解析。
- 为 Windows Agent Browser 注入稳定的 Chrome 启动参数，避免 Chrome for Testing 提前退出。
- 将 macOS 加入常规 latest 环境 smoke，及时覆盖三平台启动器和浏览器路径。

## 初始版本

| 版本 | 状态 | 范围 |
| --- | --- | --- |
| `0.0.1` | 首次提交前开发中 | TypeScript CLI、按需 Skill、MCP、模板和文档；工单示例提供 TypeScript 与 Python QA |
