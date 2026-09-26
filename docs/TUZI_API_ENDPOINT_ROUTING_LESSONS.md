# tuzi-api 端点路由兜底经验

更新日期：2026-09-26

## 背景

OpenTu AI 网页版的供应商设置需要让用户选择 tuzi-api 的真实站点端点，并在默认自动模式下选择最优路径。用户反馈深圳地址在浏览器里可能出现 `Failed to fetch`，但 tuzi-api 其它站点可以正常使用。

这类问题不能靠手写一批站点解决。端点来源必须绑定上游 tuzi-api，同时实际请求链路要能在浏览器网络错误时切换到同一上游的其它站点。

## 上游来源

- 上游仓库：[tuziapi/tuzi-api](https://github.com/tuziapi/tuzi-api)
- 状态接口：`https://api.tu-zi.com/api/status`
- 解析字段：`data.api_address_list`

内置兜底只保留当前上游暴露的站点：

- `https://api.tu-zi.com`
- `https://apius.tu-zi.com`
- `https://apicdn.tu-zi.com`
- `https://api.sydney-ai.com`
- `https://api.ourzhishi.top`
- `https://apisz.ourzhishi.top`

## 修复规则

### 1. 端点来源统一收口

端点来源集中在 `tuzi-api-endpoints.ts`：

- HTTP(S) 页面和 Worker 通过当前 origin 的 `/__opentu_tuzi_session__/api/status` 拉取状态；该固定上游代理转发到 `https://api.tu-zi.com/api/status`。
- 页面与 Tuzi API 同源，或没有 HTTP(S) location 的非浏览器环境，保留原始状态 URL。
- 公开状态请求使用 `credentials: 'omit'`，不携带 Cookie，也不添加系统令牌或 Provider API Key。
- 只解析 `data.api_address_list`。
- 只接受内置上游白名单内的 origin。
- 状态接口失败时回退内置 6 个站点。

这样设置页、模型发现和请求兜底使用同一份来源，不再分别维护站点列表。

代理沿用 Vite、Netlify、Vercel、正式和预发布 Nginx 已有的 Session 代理规则，无需新增环境变量。Vite 默认代理到 `https://api.tu-zi.com`，保留现有 `VITE_TUZI_SESSION_PROXY_TARGET` 的配置能力；其他自托管环境需提供等价代理，详见 [Tuzi 系统令牌接入](./TUZI_SYSTEM_TOKEN_INTEGRATION.md#反向代理)。只有静态文件的服务可能将代理路径回退为 SPA HTML，不能把 HTTP 200 当作成功的状态响应。代理失败仍按原有逻辑显示设置页提示并使用内置站点，不缓存失败，也不重新直连绕过 CORS。

### 2. 设置页承载端点选择

端点管理只放在应用菜单的设置页里，不放到底部 AI 输入栏：

- 默认勾选自动选择。
- 支持测速后选择延迟最低端点。
- 支持手动点击端点并同步 API 地址。
- 支持添加/删除自定义端点。
- 页面显示来源为 `tuzi-api`。

样式必须归属设置页自身，避免复用底部输入栏类名导致功能边界不清。

### 3. 模型列表获取需要同源兜底

模型发现请求 `/models` 时，如果主端点发生浏览器网络错误，可按 tuzi-api 候选端点继续尝试。

只兜底网络层错误，例如：

- `Failed to fetch`
- `Load failed`
- `NetworkError`

不要吞掉 HTTP 401、模型参数错误、鉴权错误等业务响应。

### 4. 实际生成请求也要兜底

用户真正提交图片、文本或其它任务时，传输层也要在同一请求路径上重试其它 tuzi-api 站点。

关键约束：

- 当前 baseUrl 必须属于 tuzi-api 上游站点，才允许切换。
- 保留原路径后缀，例如 `/v1`。
- 复用原请求 body、headers 和超时控制。
- 只在浏览器网络错误时重试。

## 代码落点

- `packages/drawnix/src/services/provider-routing/tuzi-api-endpoints.ts`：tuzi-api 上游来源、白名单解析、兜底站点。
- `packages/drawnix/src/components/settings-dialog/settings-dialog.tsx`：设置页端点选择、自动/手动模式、测速和自定义端点。
- `packages/drawnix/src/components/settings-dialog/settings-dialog.scss`：设置页端点面板样式。
- `packages/drawnix/src/utils/runtime-model-discovery.ts`：模型列表 `/models` 网络错误兜底。
- `packages/drawnix/src/services/provider-routing/provider-transport.ts`：实际 Provider 请求网络错误兜底。
- `packages/drawnix/src/utils/__tests__/runtime-model-discovery.test.ts`：模型发现兜底测试。
- `packages/drawnix/src/services/__tests__/tuzi-api-endpoints.test.ts`：来源解析和来源失败兜底测试。

## 检查清单

- 设置页 API 地址下方显示端点面板。
- 端点面板显示 `来源: tuzi-api`。
- 底部 AI 输入栏不显示端点选择控件。
- `data.api_address_list` 只解析 tuzi-api 上游站点。
- 深圳地址 `Failed to fetch` 时，模型发现会尝试其它 tuzi-api 站点。
- 生成请求遇到浏览器网络错误时，会尝试其它 tuzi-api 站点。
- HTTP 401、参数错误和业务错误不会被误判为可切换端点。
- tuzi-api 状态接口失败时，功能仍可使用内置 6 个站点。

## 验证建议

```bash
pnpm nx run web:typecheck
pnpm --dir packages/drawnix exec vitest run \
  src/utils/__tests__/runtime-model-discovery.test.ts \
  src/services/__tests__/tuzi-api-endpoints.test.ts
git diff --check
```

## 2026-09-26 状态接口同源代理修复与 QA

### 范围、环境和复现

- 修复公开 `/api/status` 的浏览器跨域读取；账户鉴权、生成参数、计费、画布数据和巡检功能不在本次范围内。
- 基线：`upstream/develop` / `3a5d41bafd4e03610901114a86e72b7f15eb1705`（v1.1.15）。提交 PR 前显式 fetch 后 merge，已同步且无冲突。
- 环境：macOS，Node.js `26.8.1`，pnpm `10.21.0`，使用已有依赖和 `7200` 开发服务。以下命令从仓库根目录运行。
- 线上问题曾在匿名浏览器中复现：打开设置后，直连 `https://api.tu-zi.com/api/status` 因缺少跨域响应头而失败；同页面调用既有 Session 代理可得到 JSON。此结果只证明代理可用，不代表线上前端已应用修复。

### 同步后最终本地检查

| 验证 | 结果 |
| --- | --- |
| `pnpm --dir packages/drawnix exec vitest run src/services/__tests__/tuzi-api-endpoints.test.ts src/services/__tests__/provider-routing.test.ts src/services/__tests__/image-generation-recovery-service.test.ts src/utils/__tests__/runtime-model-discovery.test.ts` | 195 项通过、1 项上游原有失败；端点 14/14、路由 118/118、图片恢复 48/48、模型发现 15/16 |
| `NX_DAEMON=false pnpm exec nx run drawnix:typecheck --skip-nx-cache` | 通过 |
| `pnpm exec eslint packages/drawnix/src/services/provider-routing/tuzi-api-endpoints.ts packages/drawnix/src/services/__tests__/tuzi-api-endpoints.test.ts` | 通过 |
| `NX_DAEMON=false pnpm exec nx run web:build-app --skip-nx-cache` | 通过 |
| `NX_DAEMON=false pnpm exec nx run web:build-sw --skip-nx-cache` | 通过 |
| `git diff --check upstream/develop...HEAD` | 通过 |

回归覆盖正式站、预发布、本地、自托管子路径、无 window 的 Worker、与上游同源和无 HTTP(S) location 的行为；验证成功缓存、失败后重试、代理 502、误返回 SPA HTML、网络失败以及内置站点回退。公开请求明确省略凭据，保留可信站点过滤和嵌入式配置逻辑。

唯一失败是 `runtime-model-discovery.test.ts` 的“主端点浏览器 fetch 失败时会尝试 tuzi-api 候选端点获取模型”：断言期望直连 `https://api.tu-zi.com/v1/models`，现有实现使用 `http://localhost:3000/__opentu_tuzi_session__/v1/models`。在未修改的 `3a5d41ba` 导出目录重跑端点、路由和模型发现三份测试得到 137 项通过、同一项失败，确认是上游原有断言问题。本次未修改模型发现模块或该断言。

### 页面验收（2026-09-25，同一基线与修复）

独立 Playwright QA harness 在匿名新上下文中执行，未使用登录凭据，也未触发生成或业务写入。三个聚焦场景全部通过：

1. 打开设置：同源状态响应为 HTTP 200 JSON、`success: true`，显示 6 个站点；重新打开时使用成功缓存。
2. 将代理响应注入为 502：显示回退提示并保留内置 6 个站点；移除注入并重新打开后，真实状态恢复且提示消失。
3. 将代理响应注入为 HTTP 200 HTML：拒绝无效 JSON 并回退；关闭设置后画布和模型菜单仍可用。

未发现直接跨域 `/api/status` 请求、未捕获页面错误或非预期网络错误。原有 6 个页面场景中 5 个通过；另一项在“Tuzi 账户”按钮断言失败，因为独立模式有意隐藏该入口，状态 HTTP/JSON 契约在失败前已通过。外部 harness 和临时产物不随本 PR 提交。

### 限制和发布验收

- 未运行全量单元测试或全仓 lint；未验收登录、模型鉴权、真实付费生成、线上部署。保留了已有的 Node.js localStorage/IndexedDB 和构建分块警告。
- `/api/image-inspection/models` 和 `/api/image-inspection/runs` 的后端 404 暂缓处理。
- 不需要新增依赖、数据库迁移或权限。自托管须配置上述同源代理；失败时仍可使用内置站点。回滚可撤销状态请求及对应测试的修复提交，无数据回滚步骤。
- 发布后人工验收：打开“应用菜单 → 设置”，确认能加载 Tuzi 站点；开发者工具中状态请求走当前站点代理并返回 JSON，没有该请求的 CORS 错误。

## 提交备注模板

```text
问题描述:
- OpenTu AI 网页版供应商端点来源需要绑定 tuzi-api 上游。
- 部分 tuzi-api 站点在浏览器环境可能出现 Failed to fetch，影响模型获取和实际生成请求。

修复思路:
- 新增 tuzi-api 端点来源模块，从 api.tu-zi.com/api/status 解析 data.api_address_list，并保留上游站点白名单兜底。
- 设置页新增端点面板，支持自动最优、测速、手动选择和自定义端点。
- 模型发现和 Provider 请求在浏览器网络错误时按同源 tuzi-api 站点重试。

更新代码架构:
- 端点来源集中到 provider-routing/tuzi-api-endpoints.ts。
- 设置页只负责端点选择 UI，不再把端点入口放到底部输入栏。
- runtime-model-discovery 和 provider-transport 共享 tuzi-api 候选端点兜底策略。
```
