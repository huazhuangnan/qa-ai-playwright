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

- 增加示例应用开发入口和 Python 示例测试入口。
- Python 测试入口使用项目 `.venv`，并透传 pytest 参数。
- GitHub Actions 调用示例测试入口。
- CI 按平台、运行时和组件版本选择 smoke 或手动完整验证范围。
- 同一验证键成功后跳过重复的环境初始化验证，版本或实现变化时自动失效。
- 手动完整验证支持通过 `cache_buster` 强制重新验证。
- 修复 Playwright CLI 实际入口解析，避免按旧版包结构拼接不存在的 `cli.js`。
- 合并仓库级 GitHub Actions 工作流，按验证范围和成功键拆分快速与完整验证。
- 修复长工作区路径下 Agent Browser 的 Unix socket 超长问题。
- 修复 Chromium 临时目录继承长工作区路径导致的 SingletonSocket 超长问题。
- 修复 Windows Codex MCP 配置中的单引号路径和混合引号数组解析。
- 为 Windows Agent Browser 注入稳定的 Chrome 启动参数，避免 Chrome for Testing 提前退出。

## 初始版本

| 版本 | 状态 | 范围 |
| --- | --- | --- |
| `0.0.1` | 首次提交前开发中 | TypeScript CLI、按需 Skill、MCP、模板和文档；工单示例提供 TypeScript 与 Python QA |
