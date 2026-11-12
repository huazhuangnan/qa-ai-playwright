# Web 功能与 E2E 测试

先应用 `qa-core` 已加载的公共执行边界。
需要设计用例时读取[测试设计](test-design.md)。
需要自动化时按项目语言读取[TypeScript](automation/typescript.md)或[Python](automation/python.md)。

## 规则

- 定位优先 role、label、稳定 test id，用范围消除歧义。
- 优先验证用户能看见和操作的行为，避免依赖内部函数、CSS 类或实现细节。
- 等待用户可见结果或明确业务状态。不以固定 sleep、networkidle 或 force 点击绕过就绪。
- 期望响应或新页面时先注册等待再触发动作。
- 验证用户可见结果及必要持久化、权限或下游状态，不止断言按钮被点击。
- 用独立会话与唯一数据隔离，认证状态按角色区分且不提交。
- 不把现状当需求，不把一次探索当持久回归。
- 有源码时检查路由、表单、请求调用、本地存储、会话和已有测试，用于发现入口、状态和候选场景。
- 表单检查必填、清空、自动填充、粘贴、输入法、键盘提交、校验时机和未保存离开。
- 页面状态检查空数据、加载、部分加载、错误、重试、深链接、刷新和重新进入。
- 浏览器流程按适用性检查刷新、返回、前进、多标签页、会话过期和恢复。
- 网络延迟、失败、重试和离线状态只在产品定义或业务确有依赖时验证。
- 自动化可访问性扫描只能发现部分问题，不能代替 WCAG 2.2 的人工键盘和辅助技术检查。
- 功能 smoke 不能代替性能验收。性能任务单独确认 LCP、CLS、INP、设备和网络条件。
- 需要启动本地页面或 API 时按[源码与本地运行发现](project-discovery.md)定位启动命令、健康检查、依赖和清理方式。
- 为关键步骤记录页面 URL、标题、角色、业务对象、可见状态、关键网络请求、控制台错误和后端持久化结果。
- 每个关键断言关联截图、Trace、视频或网络证据的 EVIDENCE-ID，并记录浏览器、设备、viewport 和等待条件。

## 说明

- 单页面行为可做 UI 功能测试。完整流程列明角色、起止状态、经过的服务和真实依赖。
- API 准备数据可减少成本，但不能替代本次要验证的用户操作。
- 多浏览器通过不等于设备、可访问性或所有兼容性通过。

## 示例

生成前按[输入清单](input-checklist.md)确认入口地址、用户旅程、角色、预期、数据准备与清理。
失败后保留截图、Trace 和请求证据。失败分析读取[失败分析](triage.md)。

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
[WCAG 2.2](https://www.w3.org/TR/WCAG22/) ·
[Core Web Vitals](https://web.dev/articles/vitals) ·
[agent-browser（浏览器探索）](https://www.skills.sh/vercel-labs/agent-browser) ·
[web-design-guidelines（UI 审查）](https://www.skills.sh/vercel-labs/agent-skills/web-design-guidelines)
