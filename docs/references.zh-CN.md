# 参考来源与行业实践

本仓库的实现依据官方文档和可核验的行业实践。
安装量为 skills.sh 当期页面快照（核对日期 2026-11-11），不等于下载次数、独立用户或质量评分。

## 官方框架

| 主题 | 链接 |
| --- | --- |
| Playwright 快速开始 | <https://playwright.dev/docs/intro> |
| Playwright 最佳实践 | <https://playwright.dev/docs/best-practices> |
| Playwright 定位器 | <https://playwright.dev/docs/locators> |
| Playwright 自动等待 | <https://playwright.dev/docs/actionability> |
| Playwright 认证 | <https://playwright.dev/docs/auth> |
| Playwright API 测试 | <https://playwright.dev/docs/api-testing> |
| Playwright 隔离与上下文 | <https://playwright.dev/docs/browser-contexts> |
| pytest 文档 | <https://docs.pytest.org/en/stable/> |
| pytest fixture 与清理 | <https://docs.pytest.org/en/stable/how-to/fixtures.html> |
| requests 超时 | <https://requests.readthedocs.io/en/latest/user/quickstart/#timeouts> |
| Python Playwright | <https://playwright.dev/python/docs/intro> |

## 落地链路官方参考

| 环节 | 链接 |
| --- | --- |
| Node.js 运行时 | <https://nodejs.org/en/download> |
| Python 运行时 uv | <https://docs.astral.sh/uv/> |
| GitHub Actions CI | <https://docs.github.com/actions> |
| GitHub-hosted runner labels | <https://docs.github.com/en/actions/reference/runners/github-hosted-runners> |
| Actionlint | <https://github.com/rhysd/actionlint> |
| Playwright MCP（Microsoft） | <https://github.com/microsoft/playwright-mcp> |

## 高下载 Skill 参考

安装量取自 skills.sh 当期页面，核对日期 2026-11-11。
计数代表仓库级安装，不等于独立用户或质量评分，仅作筛选参考。

| Skill | 安装量 | 来源 | 与本项目的关系 |
| --- | ---: | --- | --- |
| find-skills | 4.3M | Vercel Labs | 按安装量发现 Skill，本项目沿用其筛选思路 |
| grill-me | 1.5M | Matt Pocock | 开工前追问需求与验收，对应 qa-test-design 输入确认 |
| agent-browser | 1.5M | Vercel Labs | 页面观察、会话管理、按版本读指南 |
| tdd | 1.2M | Matt Pocock | 先写失败用例再实现，写自动化可参考 |
| triage | 1.1M | Matt Pocock | 问题分级与归因，对应 qa-triage |
| diagnosing-bugs | 916.8K | Matt Pocock | 按证据定位缺陷，对应 qa-triage 失败分析 |
| web-design-guidelines | 721.6K | Vercel Labs | UI 与可访问性审查，对应 qa-web 的界面检查 |
| skill-creator | 428.8K | Anthropic | 编写与评测 Skill，对应 qa-maintainer |
| brainstorming | 424.1K | obra/superpowers | 先拆问题再给方案，对应测试设计 |
| systematic-debugging | 327.6K | obra/superpowers | 四阶段结构化调试，对应 qa-triage |
| writing-plans | 299.5K | obra/superpowers | 先出方案再执行，对应 Plan 模式 |
| test-driven-development | 275.7K | obra/superpowers | 与 tdd 同思路，先写失败用例再实现 |
| verification-before-completion | 271.2K | obra/superpowers | 证据先行，对应“未执行不宣布通过” |
| dispatching-parallel-agents | 232.0K | obra/superpowers | 少量 subagent 并行，对应 AGENTS.md 边界 |
| playwright-cli | 212.9K | Microsoft | 快照定位、操作证据与可复现步骤 |
| webapp-testing | 201.9K | Anthropic | 服务生命周期、观察后行动 |
| playwright-best-practices | 101.1K | Currents.dev | 任务路由、按需参考与失败分类 |
| dogfood | 无独立计数 | Vercel Labs | 探索式 QA、缺陷与复现证据，agent-browser 子技能 |

来源页：

- <https://www.skills.sh/vercel-labs/skills>（find-skills）
- <https://www.skills.sh/mattpocock/skills>（grill-me、tdd、triage、diagnosing-bugs）
- <https://www.skills.sh/vercel-labs/agent-browser>（agent-browser、dogfood）
- <https://www.skills.sh/vercel-labs/agent-skills>（web-design-guidelines）
- <https://www.skills.sh/anthropics/skills>（skill-creator、webapp-testing）
- <https://www.skills.sh/obra/superpowers>（brainstorming、systematic-debugging、writing-plans、test-driven-development、verification-before-completion、dispatching-parallel-agents）
- <https://www.skills.sh/microsoft/playwright-cli>（playwright-cli）
- <https://www.skills.sh/currents-dev/playwright-best-practices-skill>（playwright-best-practices）

dogfood 无独立 skills.sh 页面，源码见
<https://github.com/vercel-labs/agent-browser/tree/main/skill-data/dogfood>。

## 采纳与取舍

采纳：观察后行动、保留失败证据、按任务加载参考、失败分类。
未采纳：用 `networkidle` 判断测试就绪，改用明确页面断言，依据 [Playwright Page 文档](https://playwright.dev/docs/api/class-page#page-wait-for-load-state)。

## 生态与同类方案（下个版本参考）

本节仅作下个版本评估参考，不纳入当前交付能力。

| 方案 | 链接 | 与本项目的关系 |
| --- | --- | --- |
| Playwright Test Agents（官方） | <https://playwright.dev/docs/test-agents> | planner / generator / healer 三代理，对应本项目的设计、生成、修复链路 |
| State of Playwright AI Ecosystem 2026 | <https://currents.dev/posts/state-of-playwright-ai-ecosystem-in-2026> | MCP 与 CLI 成本对比、未解问题的行业综述 |
| QA_FlowKit | <https://github.com/warante/QA_FlowKit> | 按 quick / standard / enterprise 分层 QA 流程 |
| tester-army / e2e | <https://github.com/tester-army/e2e> | agentic E2E，AI 操作与传统断言混合 |

## 许可证

| 来源 | 许可证 |
| --- | --- |
| Vercel agent-browser | Apache-2.0 |
| Microsoft playwright-cli | Apache-2.0 |
| Anthropic webapp-testing | Apache-2.0 |
| Currents playwright-best-practices | MIT |
| farion1231 CC Switch | MIT |

源文件：

- <https://github.com/vercel-labs/agent-browser/blob/main/skills/agent-browser/SKILL.md>
- <https://github.com/microsoft/playwright-cli/blob/main/skills/playwright-cli/SKILL.md>
- <https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md>
- <https://github.com/currents-dev/playwright-best-practices-skill/blob/main/playwright-best-practices/SKILL.md>
- <https://github.com/farion1231/cc-switch/tree/v4.0.28>
