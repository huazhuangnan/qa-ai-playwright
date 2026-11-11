# Python 示例 QA

本目录使用 pytest、requests 和 pytest-playwright 验证工单示例。
被测应用位于 [`qa-ticket-app`](../qa-ticket-app/README.md)。

## 共享输入

业务需求和 OpenAPI 只维护一份：

| 输入 | 位置 |
| --- | --- |
| 输入索引 | [`input-index.md`](../qa-ticket-app/docs/qa/inputs/input-index.md) |
| 产品需求 | [`requirements.md`](../qa-ticket-app/docs/qa/inputs/requirements.md) |
| 测试计划 | [`test-plan.md`](../qa-ticket-app/docs/qa/generated/test-plan.md) |
| 测试用例 | [`test-cases.md`](../qa-ticket-app/docs/qa/generated/test-cases.md) |
| 自动化映射 | [test-mapping.md](docs/qa/generated/test-mapping.md) |
| OpenAPI | [`openapi.json`](../qa-ticket-app/src/server/openapi.json) |

## 准备

先初始化 Python QA 环境并激活它。
在仓库根目录安装示例应用依赖：

```bash
pnpm install --frozen-lockfile
```

进入本目录创建隔离环境并安装哈希锁。

Windows：

```powershell
uv venv .venv
uv pip sync requirements.lock --python .venv/Scripts/python.exe
.\.venv\Scripts\python.exe -m playwright install chromium
```

macOS / Linux：

```bash
uv venv .venv
uv pip sync requirements.lock --python .venv/bin/python
.venv/bin/python -m playwright install chromium
```

## 执行

Windows：

```powershell
.\.venv\Scripts\python.exe -m pytest
```

macOS / Linux：

```bash
.venv/bin/python -m pytest
```

测试会启动本地 API 和页面服务。
两个服务只使用 `127.0.0.1:5173` 和 `127.0.0.1:8787`。
不要同时运行另一套示例测试，避免端口冲突。

报告位于 `reports/junit.xml`。
失败时检查 pytest 输出和浏览器 Trace；分享前先脱敏。
未执行结果不能写成通过。
当前版本尚无新的 Python 执行记录。

## 依赖锁

修改 `requirements.in` 后生成新锁：

```bash
uv pip compile requirements.in --python-version 3.15 --universal --generate-hashes --output-file requirements.lock
bun scripts/prepare-lock.ts
```

提交 `requirements.lock` 与 `requirements.lock.meta.json`。

## 边界

- 只通过 HTTP 和浏览器访问被测应用。
- 每次运行使用独立临时数据库。
- 测试数据使用唯一标题并在测试结束时清理。
- 不提交 `.venv`、报告、浏览器状态或凭证。
