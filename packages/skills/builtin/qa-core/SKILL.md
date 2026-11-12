---
name: qa-core
description: 端到端 QA 工作流入口；用于理解业务、设计测试、选择 API 或 Web 验证、编写 TypeScript/Python 自动化、分析结果和整理资料。不用于通用功能开发、性能调优或安全审计。
metadata:
  version: "0.0.1"
---

# QA 工作流入口

先读项目 AGENTS.md、需求或验收标准、相关测试和可用环境。
开始专业任务前读取[公共执行边界](references/common-workflow.md)。
按当前目标和项目证据选择后续 reference，不要一次加载全部内容。

## 任务路由

| 当前目标 | 下一步 |
| --- | --- |
| 不了解业务、角色、流程或范围 | [业务理解](references/business-guide.md) |
| 需要计划、用例、覆盖矩阵或回归范围 | [测试设计](references/test-design.md) |
| 处理 OpenAPI、接口、认证或集成 | [API 与服务测试](references/api-testing.md) |
| 处理页面、登录或 E2E | [Web 功能测试](references/web-testing.md) |
| 编写或调试 TypeScript 自动化 | [TypeScript 适配](references/automation/typescript.md) |
| 编写或调试 Python 自动化 | [Python 适配](references/automation/python.md) |
| 分析失败、缺陷或复测 | [失败分析](references/triage.md) |
| 归档外部资料或静态导出 | [资料处理](references/documents.md) |
| 管理 QA CLI 环境或项目 | 使用独立 Skill `qa-setup` |

默认顺序为：理解业务 → 设计测试 → 选择 API/UI → 生成实现 → 分析结果。
上一阶段产出作为下一阶段输入。任务已经明确时跳过不需要的阶段。
API 和 Web 只有组合任务才同时读取。仅设计手工用例时不创建运行器。
自动化语言先从项目清单、依赖和现有测试判断。无法判断且会影响执行时再询问。

## 按需参考

- 链接类型不明确时读取[链接输入分类](references/link-routing.md)。
- 需要资料清单时读取[输入清单](references/input-checklist.md)中适用章节。
- 需要源码、启动服务或自动执行时读取[源码与本地运行发现](references/project-discovery.md)。
- 推荐功能测试场景时读取[通用测试基线](references/test-design/universal-baseline.md)。
- 基线不足时，只从[功能风险目录](references/test-design/feature-patterns.md)读取匹配章节。
- 生成或修改测试代码时读取[生成代码质量](references/generated-code-quality.md)。
- 需要外部 Skill 时读取[外部 Skill 按需使用](references/external-skills.md)。
- 当前任务已读的 reference 不重复加载。

## 执行规则

- 用户只给链接和测试目标时，按内容识别类型，并选择业务、测试设计及适用的 API/Web 路线。
- 先检查现有项目和资料，再在授权范围内访问链接、观察功能并查找契约。
- 访问失败或无法登录时记录限制，继续设计不依赖该访问的部分。
- 合并询问影响执行的资料。缺失时继续处理有依据的部分，并标记缺口和阻塞条件。
- 在对话中预览测试计划和用例，区分资料依据、页面观察与通用建议。
- 请求用户确认后再写入正式文档；已明确授权直接写入时遵循用户要求。
- 缺少契约时不虚构 API。缺少可判定预期时保留待确认，不生成虚假通过断言。
- 在环境、账号、写入和清理条件满足时执行可运行部分。
- 否则报告阻塞、已完成项与下一步。
- 用户明确要求自动测试时，主动定位现有测试和启动方式。
- 优先运行目标用例，并记录服务和数据清理结果。
- 按任务使用可用的 MCP。Skill 负责流程指导和结果解释。

## 追踪与证据

- 统一追踪 ID 使用 `REQ/BR/RISK/SCN/CASE/STEP/ASSERT/RUN/EVIDENCE/BUG/RETEST` 前缀。
用例 ID 在生命周期内保持稳定。需求或契约变化时增加版本并记录影响，不直接覆盖历史语义。
用例生命周期为 `draft → reviewed → active → executed`。
失败进入 `triage`，产品问题进入 `defect-open`，修复后进入 `retest-required`。
复测通过后回到 `active`。需求变化进入 `impact-review`，再决定更新、废弃或阻塞。
- 证据、结论和专项边界遵守[公共执行边界](references/common-workflow.md)。

## 文档产出

`docs/qa` 下的 Markdown 文档按任务生成，共用同一质量要求：
逐项填字段、一句话一个意思、不写“同上”、不把多条事实塞进一个单元格。

| 文档 | 写入位置 | 参考 |
| --- | --- | --- |
| 业务理解 | `docs/qa/generated/business-understanding.md` | [业务理解](references/business-guide.md) |
| 测试计划 | `docs/qa/generated/test-plan.md` | [测试设计](references/test-design.md) |
| 测试用例 | `docs/qa/generated/test-cases.md` | [测试设计](references/test-design.md) |
| 缺陷报告 | `docs/qa/generated/defect.md` | [失败分析](references/triage.md) |
| 执行报告 | `docs/qa/generated/execution-report.md` | [失败分析](references/triage.md) |
| 外部资料摘要 | `docs/qa/inputs/external/` | [资料处理](references/documents.md) |
| 静态导出 | `docs/qa/generated/` | [资料处理](references/documents.md) |

`docs/qa/inputs` 默认只读，`tasks` 保存任务，`generated` 保存 AI 产出。
