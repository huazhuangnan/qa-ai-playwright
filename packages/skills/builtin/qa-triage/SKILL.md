---
name: qa-triage
description: 分析测试失败和不稳定用例，整理可复现缺陷、证据及执行报告；用于手工、API、UI 和自动化回归结果，不以改断言或重试掩盖产品回归。
metadata:
  version: "0.0.1"
---

# 失败分析与结果交付

先读取 [qa-core](../qa-core/SKILL.md) 通用规则。
读取原始错误、实际命令、需求预期、版本、环境和证据后再修改。

## 规则

- 按证据区分环境/依赖、产品缺陷、测试实现、数据或顺序污染、待确认。
- 区分原测试失败与清理失败，保留原始错误。
- 产品违背需求则保留失败与证据。经确认需求变更才更新预期。
- 一次通过或重试后通过不证明修复，不直接放大超时或重试。
- CI 重试后通过仍标记为 flaky。门禁开启时应阻断流水线。
- 不索取生产 Token、Cookie 或真实客户数据，证据先脱敏。
- 无环境则交付分析，明确未重跑，不宣布修复已验证。
- 每次执行生成稳定 RUN-ID，每个失败记录 CASE-ID、STEP-ID、ASSERT-ID、最后成功步骤、原始错误、实际值、期望值、复现次数和 EVIDENCE-ID。
- 重试后通过仍标记 flaky；连续失败、证据不足或分类变化必须进入下一次 triage，不得用重试掩盖趋势。
- 产出两份文档：缺陷报告 `docs/qa/generated/defect.md`、执行报告 `docs/qa/generated/execution-report.md`。
- 逐项填写模板字段。不省略字段、不写“同上”、不把多条事实塞进一个单元格。

## 说明

- 连接失败查地址和服务。断言不符对照需求。定位器歧义先观察页面。并行失败查共享账号、数据和会话。
- 限制复现次数和成本。CI 专有失败比较依赖、浏览器、时区与资源。
- 沿用运行器统计口径，说明重试归属以免重复计数。
- 缺陷质量看两点：能否按步骤复现，证据能否支撑结论。

## 文档产出

缺陷报告 `defect.md` 必须包含：标题与分类、严重程度、关联需求/用例、版本环境、前置条件、最小复现步骤、需求预期、实际结果、复现频率、脱敏证据、跟踪与复测。

执行报告 `execution-report.md` 必须包含：范围与构建、执行命令、互斥的结果统计、需求覆盖、未解决缺陷、清理结果、剩余风险、验收结论。
结果统计五项互斥：首次通过、重试后通过、最终失败、跳过、未执行。

## 示例

```text
缺陷 D-001
  标题: stg 环境登录接口返回 500，阻断后续用例
  分类: 环境
  严重程度: 阻断
  环境: stg；构建 abc123；Chrome 131
  步骤: 1. POST /auth/login 携带最小合法请求体
  预期: 200 并返回 token（依据 REQ-002）
  实际: 500，服务端日志见 trace 链接
  频率: 5/5
  证据: trace.zip（已脱敏，核对访问权限）
```

## 参考

[systematic-debugging（四阶段调试）](https://www.skills.sh/obra/superpowers/systematic-debugging) ·
[verification-before-completion（证据先行）](https://www.skills.sh/obra/superpowers/verification-before-completion) ·
[Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer-intro) ·
[Playwright 调试](https://playwright.dev/docs/debug)
