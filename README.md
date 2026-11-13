# QA + AI + Playwright

[QA 使用文档](docs/users/README.md) | [QA 维护文档](https://github.com/huazhuangnan/qa-ai-playwright/blob/main/docs/maintainers/README.md)

维护者文档仅存在于源码仓库，不随使用者包发布。
帮助使用 Codex 完成 QA 任务。
CLI 用于准备环境和项目，Skills 与 MCP 协助测试设计、执行和结果分析。

## 快速开始

### 下载交付包

1. 打开 [GitHub Releases](https://github.com/huazhuangnan/qa-ai-playwright/releases)。
2. 下载 `qa-ai-playwright-v版本号.zip`。
3. 解压后进入其中的 `qa-ai-playwright-版本号` 目录。

Windows、macOS 和 Linux 使用同一个交付包。
没有可下载的 Release 时，请联系交付人员。

### 安装和初始化

按以下步骤安装并初始化项目。

1. 在交付包根目录安装全局命令。
2. 重新打开终端。
3. 执行项目初始化命令。

| 平台 | 安装命令 |
| --- | --- |
| Windows PowerShell 7 | `pwsh -ExecutionPolicy Bypass -File packages/qa-cli/bin/install.ps1` |
| Windows PowerShell 5.1 | `powershell -ExecutionPolicy Bypass -File packages/qa-cli/bin/install.ps1` |
| macOS、Linux、WSL | `bash packages/qa-cli/bin/install.sh` |

项目初始化：

```text
qa project init <项目目录> --language <python|typescript>
```

首次运行可能需要联网。
CLI 优先复用系统工具，缺少时按配置安装。项目初始化会自动准备标准环境，并安装项目级 `qa-core`。
QA 环境默认位于用户目录的 `.qa-ai-playwright`。
测试项目各自独立。

参数和目录说明见[环境初始化](docs/users/environment.zh-CN.md)。
配置测试环境、角色、数据和清理方式后，按[从需求到执行](docs/users/qa-workflow.zh-CN.md)开展测试。

也可以直接输入：

```text
使用 QA 的能力，帮我测试这个链接的登录功能：［链接］
```

Codex 会识别输入并预览测试计划。
确认后写入文档并生成测试。
缺少资料时，Codex 会继续处理有依据的部分，并列出待确认项。

## 选择语言

按已有用例、维护语言和团队工具选择一种即可。

| 方案 | 适用情况 | 文档 |
| --- | --- | --- |
| TypeScript | 使用 Playwright Test 维护 API、功能和 E2E | [TypeScript 指南](docs/users/typescript.zh-CN.md) |
| Python | 复用 pytest，使用 requests 与 pytest-playwright | [Python 指南](docs/users/python.zh-CN.md) |

两种语言也可以使用 `env init both` 同时安装。

## 安装范围

- **浏览器**：优先复用已有兼容浏览器。确认缺失后才下载。
- **Skill**：`qa-core` 和 `qa-setup` 随交付包提供；Bun、pnpm 等外部 Skill 按任务从固定来源安装。
- **MCP**：默认注册 QA MCP 和 Playwright MCP。
- **CC Switch**：默认准备。不需要时添加 `--skip-cc-switch`。

详细范围见[环境初始化](docs/users/environment.zh-CN.md)和 [Skills 与 MCP](docs/users/skills-mcp.zh-CN.md)。
