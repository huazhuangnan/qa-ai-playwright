---
name: qa-web
description: 验证 Web 页面功能、浏览器探索及关键用户流程 E2E；用于用户可见行为、会话和跨页面链路，区分局部 UI 功能与完整 E2E，不承担专项可访问性审计。
metadata:
  version: "0.0.1"
---

# Web 功能与 E2E 测试

先读取 [qa-core](../qa-core/SKILL.md) 通用规则。设计时读 [qa-test-design](../qa-test-design/SKILL.md)，自动化按路由选语言适配。

## 规则

- 定位优先 role、label、稳定 test id，用范围消除歧义。
- 等待用户可见结果或明确业务状态。不以固定 sleep、networkidle 或 force 点击绕过就绪。
- 期望响应或新页面时先注册等待再触发动作。
- 验证用户可见结果及必要持久化、权限或下游状态，不止断言按钮被点击。
- 用独立会话与唯一数据隔离，认证状态按角色区分且不提交。
- 不把现状当需求，不把一次探索当持久回归。

## 说明

- 单页面行为可做 UI 功能测试。完整流程列明角色、起止状态、经过的服务和真实依赖。
- API 准备数据可减少成本，但不能替代本次要验证的用户操作。
- 多浏览器通过不等于设备、可访问性或所有兼容性通过。

## 示例

生成前按 [输入清单](../qa-core/references/input-checklist.md) 确认入口地址、用户旅程、角色、预期、数据准备与清理。
失败后保留截图、Trace 和请求证据。失败分析读 [qa-triage](../qa-triage/SKILL.md)。

```text
流程: 已登录用户提交订单后，订单出现在列表且状态为待支付。

用例 WEB-001 提交订单
  前置: user 已登录，购物车有 1 件隔离商品
  步骤: 1. 进入结算页  2. 点击提交订单  3. 打开订单列表
  预期: 提交后出现订单号，列表中该订单状态为待支付
  证据: 提交后截图 + 订单列表截图
  清理: 取消订单或使用隔离订单
```

## 参考

[Playwright 定位器](https://playwright.dev/docs/locators) ·
[自动等待](https://playwright.dev/docs/actionability) ·
[agent-browser（浏览器探索）](https://www.skills.sh/vercel-labs/agent-browser) ·
[web-design-guidelines（UI 审查）](https://www.skills.sh/vercel-labs/agent-skills/web-design-guidelines)
