# 行业实践映射

本参考只在需要建立质量基线、审查测试方案或解释规范依据时读取。它把行业实践转成可执行规则，不把专项标准通过写成已完成验收。

## 采用范围

| 来源 | 采用内容 | 在本 Skill 中的落地 |
| --- | --- | --- |
| ISO/IEC/IEEE 29119 | 测试过程、测试设计、执行记录和报告 | 计划、用例、执行、结果和追踪字段保持完整 |
| Playwright 官方实践 | 用户可见行为、隔离、稳定定位器、自动等待和 Web-first 断言 | UI 测试不依赖实现细节、固定等待或共享状态 |
| OpenTelemetry 语义约定 | 稳定的服务、错误、异常和关联属性 | 运行、请求、日志和证据使用一致的关联 ID 与环境字段 |
| OWASP ASVS | 安全验证要求、范围、版本和例外记录 | 安全场景单独路由，记录要求 ID、范围、证据和未覆盖项 |

## 统一质量要求

- **风险驱动**：先说明业务影响、发生可能性、资料依据和不覆盖原因，再决定测试层级和范围。
- **可追踪**：需求、风险、场景、用例、步骤、断言、运行、证据和缺陷使用稳定 ID 串联。
- **可重复**：测试拥有独立数据、会话和清理路径；运行条件、版本和配置可复现。
- **可观察**：关键动作产生可读步骤；失败保留原始错误、业务对象、环境、关联 ID 和脱敏证据。
- **可判定**：预期来自需求或契约；每个通过或失败都有可观察信号和证据。
- **可控**：写入、外部副作用、凭证、生产环境和权限扩大有明确授权、停止条件和恢复方案。
- **分层验证**：单元、API、集成和 UI 各自验证职责，不用一层的通过替代另一层的覆盖。
- **缺陷闭环**：失败分类、复现步骤、影响、证据、修复版本和复测结果必须能相互关联。

## 专项边界

- 通过功能 smoke 不能宣称性能、安全、可访问性或兼容性合规。
- ASVS 场景必须记录采用的版本、要求 ID、验证范围、例外和证据；没有这些字段只能称为安全相关测试。
- 遥测字段用于定位和关联，不把日志或 trace 存在当作业务成功。
- Playwright 的 locator、自动等待和隔离规则适用于浏览器自动化；API、数据和环境管理仍需各自的契约与清理规则。

## 评审问题

1. 这个用例验证哪个业务风险？依据是什么？
2. 失败时能否定位到 CASE、STEP、ASSERT、RUN 和 EVIDENCE？
3. 测试能否独立、重复、并行运行并清理数据？
4. 通过条件是否来自需求或契约，而不是当前实现？
5. 写入、敏感数据和外部副作用是否有授权、停止和恢复边界？
6. 是否把功能测试结果误写成专项合规结论？

## 官方来源

- ISO/IEC/IEEE 29119 系列概览：<https://www.iso.org/files/live/sites/isoorg/files/developing_standards/who_develops_standards/docs/ISO_IEC_JTC%201_SC%207%20Brochure.pdf>
- Playwright 最佳实践：<https://playwright.dev/docs/best-practices>
- Playwright 定位器：<https://playwright.dev/docs/locators>
- Playwright 测试编写与隔离：<https://playwright.dev/docs/writing-tests>
- OpenTelemetry 语义约定：<https://opentelemetry.io/docs/specs/otel/semantic-conventions/>
- OWASP ASVS：<https://asvs.owasp.org/>
