# 架构

## 结构

```text
qa-ticket-app/
├── src/
│   ├── client/       React 页面与 shadcn/ui 组件
│   └── server/       Hono、Drizzle、SQLite 和 seed
├── drizzle/          数据库迁移
└── docs/             示例应用说明
```

QA 文档位于 `../../../docs/examples/qa-ticket-app/`。
TypeScript 与 Python 测试分别位于 `../../qa-ticket-app-suite-typescript/` 和 `../../qa-ticket-app-suite-python/`。

## 运行时

| 组件 | 端口 | 说明 |
| --- | --- | --- |
| Vite | 5173 | React 开发页面 |
| Hono | 8787 | API 和 cookie 会话 |
| SQLite | 文件 | 默认 `data/qa-ticket.db` |

开发时 Vite 将 `/api` 代理到 Hono。
生产构建后 Hono 可提供 `dist/` 静态文件。

## 数据模型

| 表 | 关键字段 |
| --- | --- |
| `users` | `id`、`username`、`role`、`password_hash` |
| `sessions` | `token_hash`、`user_id`、`expires_at` |
| `tickets` | 标题、描述、状态、优先级、负责人、创建人、版本 |
| `comments` | `ticket_id`、`author_id`、`body` |
| `audit_logs` | `ticket_id`、`actor_id`、`action`、`metadata` |

外键默认开启。
删除工单时级联删除评论和审计记录。

## 会话

- 登录成功生成随机 token。
- 数据库只保存 token 的 SHA-256。
- 浏览器 cookie 保存原 token。
- cookie 使用 `HttpOnly` 和 `SameSite=Lax`。
- 测试通过独立 browser context 隔离会话。

## 权限

| 操作 | 成员 | 管理员 |
| --- | --- | --- |
| 查看全部工单 | 是 | 是 |
| 创建工单 | 是 | 是 |
| 更新他人工单 | 否 | 是 |
| 删除他人工单 | 否 | 是 |
| 修改负责人 | 否 | 是 |
| 添加评论 | 是 | 是 |

## 错误格式

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "不能修改他人的工单"
  }
}
```

## 测试隔离

- QA 项目通过 HTTP 和浏览器访问应用。
- E2E 启动独立临时数据库。
- 示例应用提供可注入数据库入口。
- 测试数据和会话由 QA 项目隔离。

## 手动运行

在仓库根目录执行 `pnpm install --frozen-lockfile`。进入本应用目录后执行：

```powershell
bun run db:seed
bun run dev
```

演示账号：

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `demo1234` | 管理员 |
| `alice` | `demo1234` | 普通成员 |
| `bob` | `demo1234` | 普通成员 |

这些账号只用于本地示例。
