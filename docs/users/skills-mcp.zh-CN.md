# Skills 与 MCP

[使用文档](README.md) | [维护文档](https://github.com/huazhuangnan/qa-ai-playwright/blob/main/docs/maintainers/README.md)

Skill 帮助 Codex 按任务理解需求、设计和执行测试。MCP 提供浏览器等工具。

## 推荐方式

| 场景 | 推荐方式 | Skill 来源 |
| --- | --- | --- |
| 新建 QA 项目 | `qa project init <目录> --language <语言>` | `qa-core` 从交付包内置目录安装 |
| 使用 QA CLI 管理 Skill | `qa skills install <目录> <名称>` | 从交付包内置目录安装 |
| 已有项目且不使用 QA CLI | `skills add` | 从 GitHub 远程仓库安装 |

`qa-core` 和 `qa-setup` 是交付包内置 Skill。`playwright-cli`、`agent-browser`、`webapp-testing`、`playwright-best-practices`、`bun-runtime` 和 `pnpm` 属于外部 Skill，按需从固定提交安装，不会随 QA 交付包打包。

新建项目时，优先使用 `qa project init`。它会准备标准环境，并自动安装项目级 `qa-core`。

## 不使用 QA CLI

以下方式适用于已有业务项目，且不使用 QA CLI 的情况。命令在业务项目根目录执行，需要可访问 Skill 来源的 Git 权限，以及 Node.js 22.18 或更高版本。

### 安装 Skills

查看可安装的 Skill：

```bash
npx -y skills@1.8.1 add https://github.com/huazhuangnan/qa-ai-playwright --list
```

安装 QA 主 Skill：

```bash
npx -y skills@1.8.1 add https://github.com/huazhuangnan/qa-ai-playwright --skill qa-core --agent codex --copy
```

`qa-core` 包含 QA 工作流和按需读取的领域参考。
也可以省略 `--skill`，在列表中选择。
安装到当前项目后，重新打开 Codex 会话，使用 `/skills` 查看。
安装器的用法见 [skills 官方文档](https://github.com/vercel-labs/skills)。

需要 Codex 按统一规则管理 QA CLI 环境时，再安装 `qa-setup`：

```bash
npx -y skills@1.8.1 add https://github.com/huazhuangnan/qa-ai-playwright --skill qa-setup --agent codex --copy
```

### 在测试流程中使用

| 阶段 | 入口 | 用途 |
| --- | --- | --- |
| 开始任务 | `qa-core` | 检查输入、范围和执行边界 |
| 理解业务 | `qa-core` 业务参考 | 梳理业务规则和待确认问题 |
| 设计测试 | `qa-core` 测试设计参考 | 制定测试计划、用例和需求追踪 |
| 选择验证方式 | `qa-core` API/Web 参考 | 分别设计接口和页面验证 |
| 编写自动化 | `qa-core` 语言参考 | 按项目语言生成和维护测试 |
| 分析结果 | `qa-core` 结果分析参考 | 分析失败、证据和复测范围 |
| 整理资料 | `qa-core` 资料参考 | 按需归档资料和导出文档 |

在 Codex 中输入例如：`$qa-core 根据需求设计接口测试，先检查缺少的资料`。
`qa-core` 根据任务读取需要的参考，无需逐阶段选择 Skill。
`qa-setup` 只负责 QA CLI 环境管理。未使用 QA CLI 时无需安装。

`qa-core` 负责入口导航。
Codex 只读取当前任务需要的参考，已读取的内容在当前任务内复用。
手工用例不加载自动化参考。
API-only 任务不加载 Web 参考。
失败分析留到实际运行后。

源码读取、项目启动和自动执行由 `qa-core` 的按需参考统一导航。
随后按任务选择 API 或 Web 参考，再加载项目语言的自动化参考。

生成代码时 `qa-core` 还会按需加载代码质量参考。
该参考约束 TSDoc 或 docstring、流程注释、复用、类型、断言和清理。
用户侧总览见[测试设计与生成](test-design.zh-CN.md)。
安全、性能、可访问性和兼容性仍是独立专项。

### 安装浏览器 MCP

需要浏览器操作时，先用 `codex mcp list` 检查是否已有可用的 playwright 注册。没有时，在终端执行：

```bash
codex mcp add playwright -- npx -y @playwright/mcp@0.0.85
```

首次启动需要联网。按 Playwright MCP 的要求准备浏览器。重启 Codex 后确认浏览器工具可用。测试运行器、依赖和测试环境由业务项目自行准备。

## 使用 QA CLI

需要使用 QA CLI 管理环境和项目时，请参考[环境初始化](environment.zh-CN.md)。完整测试流程见[从需求到执行](qa-workflow.zh-CN.md)。

日常测试不需要手工维护组件来源或锁记录。
