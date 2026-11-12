# QA + AI + Playwright

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

Windows 优先使用 PowerShell 7，也可使用 Windows PowerShell 5.1。
在交付包根目录安装全局命令，然后重新打开终端。

```powershell
pwsh -ExecutionPolicy Bypass -File packages/qa-cli/bin/install.ps1
```

PowerShell 7 不可用时，改用 `powershell -ExecutionPolicy Bypass -File packages/qa-cli/bin/install.ps1`。

```powershell
qa env init typescript
qa project init .\workspaces\my-qa --language typescript
```

macOS、Linux 和 WSL 使用 Bash 或 zsh。

```bash
bash packages/qa-cli/bin/install.sh
```

```bash
qa env init typescript
qa project init my-qa --language typescript
```

首次运行可能需要联网。
CLI 优先复用系统工具，缺少时按配置安装。
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
- **Skill**：QA 任务安装 `qa-core`，环境管理使用 `qa-setup`。Bun、pnpm 等 Skill 按任务复用。
- **MCP**：默认注册 QA MCP 和 Playwright MCP。
- **CC Switch**：仅在添加 `--with-cc-switch` 时准备。

详细范围见[环境初始化](docs/users/environment.zh-CN.md)和 [Skills 与 MCP](docs/users/skills-mcp.zh-CN.md)。

## 文档

- [环境初始化](docs/users/environment.zh-CN.md)：系统要求、参数、目录和卸载
- [TypeScript 指南](docs/users/typescript.zh-CN.md)：快速开始、测试和报告
- [Python 指南](docs/users/python.zh-CN.md)：快速开始、测试和报告
- [代码风格与架构规范](docs/users/code-style-architecture.zh-CN.md)：跨语言边界、分层和语言差异
- [Skills 与 MCP](docs/users/skills-mcp.zh-CN.md)：组件、来源和作用域
- [AI 文档与上下文](docs/users/ai-docs.zh-CN.md)：链接资料、静态导出和上下文控制
- [AI 测试整体模型](docs/users/ai-testing-model.zh-CN.md)：主流程、Skill 路由、测试层级和证据闭环
- [测试设计与生成](docs/users/test-design.zh-CN.md)：场景选择、源码运行、可维护代码和专项边界
- [从需求到执行](docs/users/qa-workflow.zh-CN.md)：输入、调用、执行和证据
