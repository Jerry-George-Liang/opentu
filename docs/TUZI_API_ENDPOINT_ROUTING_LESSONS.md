# tuzi-api 端点路由兜底经验

更新日期：2026-09-25

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

代理沿用 Vite、Netlify、Vercel、正式和预发布 Nginx 已有的 Session 代理规则，无需新增环境变量；其他自托管环境需提供等价代理，详见 [Tuzi 系统令牌接入](./TUZI_SYSTEM_TOKEN_INTEGRATION.md#反向代理)。只有静态文件的服务可能将代理路径回退为 SPA HTML，不能把 HTTP 200 当作成功的状态响应。代理失败仍按原有逻辑显示设置页提示并使用内置站点，不缓存失败，也不重新直连绕过 CORS。

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

## 2026-09-25 状态接口同源代理修复与 QA

### 范围和环境

- 本次只修复公开状态请求的跨域读取，不修改账户鉴权、Provider 地址或巡检接口。两个巡检读取接口的 404 按用户决定暂缓处理。
- 首次验证基线：`develop` / `fa0105c8`；macOS，Node.js `26.8.1`，pnpm `10.21.0`。后续上游同步结果见下方补充记录。
- 使用已有依赖和 `7200` 开发服务；匿名读取代理，不传 Cookie、令牌或 API Key，不发送生成请求。

### 同步前验证结果（fa0105c8）

| 验证 | 结果 |
| --- | --- |
| `pnpm --dir packages/drawnix exec vitest run src/services/__tests__/tuzi-api-endpoints.test.ts src/services/__tests__/provider-routing.test.ts src/utils/__tests__/runtime-model-discovery.test.ts` | 3 个文件、119 项通过，其中端点模块 13 项 |
| `NX_DAEMON=false pnpm exec nx run drawnix:typecheck --skip-nx-cache` | 通过 |
| `pnpm exec eslint packages/drawnix/src/services/provider-routing/tuzi-api-endpoints.ts packages/drawnix/src/services/__tests__/tuzi-api-endpoints.test.ts` | 通过 |
| `NX_DAEMON=false pnpm exec nx run web:build-app --skip-nx-cache` | 通过 |
| `NX_DAEMON=false pnpm exec nx run web:build-sw --skip-nx-cache` | 通过 |
| `git diff --check` | 通过 |
| 用 Node 直接导入修改后的端点模块，将 location 设为本地站点并实际调用 | 请求 `http://localhost:7200/__opentu_tuzi_session__/api/status`，HTTP 200 JSON，解析到 6 个可信站点 |
| 匿名读取本地、预发布、正式站的 `/__opentu_tuzi_session__/api/status` | 三者均返回 `success: true` 和对象类型的 `data`；仅证明代理可用，不代表线上前端已应用修复 |

回归覆盖正式站、预发布、本地、自托管子路径、无 window 的 Worker、与上游同源和无 HTTP(S) location 的行为；验证成功缓存、失败后重试、代理 502、误返回 SPA HTML、网络失败以及内置站点回退。公开请求明确省略凭据，保留可信站点过滤。

### 同步前已知问题和未执行项

- 扩大检查时，`tuzi-session-api.test.ts` 为 11 项通过、3 项失败：断言仍期待 `localhost:3100` 直连，现有实现走当前站点 Session 代理。已在临时目录中用未修改的 `HEAD` 文件复现同样的 3 个失败，属于原有测试与实现不一致，本次未修改账户模块。
- 测试环境仍有 Node.js localStorage/IndexedDB 提示；构建有已有的动态/静态导入分块提示，均未使上述定向检查失败。
- 配套本地测试目录 `opentu- shall` 的状态契约用例已改为匹配页面同源代理，并要求 `success: true`；仅完成 `node --check tests/network-contracts.spec.mjs` 和 `npx --no-install playwright test tests/network-contracts.spec.mjs --list`，没有运行页面测试。巡检测试保持不变。
- 未做浏览器交互验收、真实生成、登录态验证、提交、推送或部署。发布后仍需验收“打开设置能加载 Tuzi 站点，状态请求不再出现 CORS 错误”。
- 本地基线与正式站/预发布构建提交不同。发布时应将本次局部修复集成到对应目标版本，完成上游同步与回归后再部署，不应直接用旧本地基线覆盖线上。

### 同日同步 upstream/develop 后的回归

- 已快进同步 32 个提交，当前 `develop` 的 HEAD 与 `upstream/develop` 均为 `3a5d41bafd4e03610901114a86e72b7f15eb1705`（v1.1.15），本地状态接口修复无冲突恢复，尚未提交或推送。
- 同步前 HEAD 保留在 `dev/backup-before-upstream-sync-20260925-fa0105c8`；同步前未提交修复保留在 stash `9b8557f11bf98353c0b39b3ebc55d8c7ae96728a`，恢复后未删除备份。
- 上游端点模块新增嵌入式配置依赖。无 location 的非浏览器测试同时设定 `window` 不存在，以准确模拟运行环境；状态接口实现和上游新增的配置节点逻辑均保留。
- 重跑上述 3 个 Vitest 文件：148 项中 147 项通过、1 项失败。端点模块 14 项、Provider 路由 118 项全部通过；模型发现 16 项中 15 项通过。
- 剩余失败为 `runtime-model-discovery.test.ts` 的“主端点浏览器 fetch 失败时会尝试 tuzi-api 候选端点获取模型”：断言期望直连 `https://api.tu-zi.com/v1/models`，实际使用 `http://localhost:3000/__opentu_tuzi_session__/v1/models`。将未修改的 `3a5d41ba` 从 Git 导出到临时目录并重跑相同 3 个文件，得到 137 项通过、同一项失败，确认是上游原有问题，本次未改动该模块。
- 在新基线上，`drawnix:typecheck`、定向 ESLint、`web:build-app`、`web:build-sw` 和 `git diff --check` 均通过；命令与同步前表格相同。
- 本地 `7200` 服务仍在运行，`/version.json` 返回 v1.1.15。同步后补做了匿名页面验收：真实代理、502 回退与恢复、误返回 SPA HTML 三个场景均通过；未进行登录、生成、巡检修复或部署。

### 同步后页面验收与影响回归

- 使用本地 v1.1.15 服务和独立 Playwright QA harness，在匿名新上下文中验证真实同源状态响应：HTTP 200 JSON、`success: true`、解析到 6 个站点；设置页成功打开并重新打开时命中成功缓存。
- 注入代理 502 后，设置页显示回退提示并保留内置 6 个站点；移除注入后重新打开，真实状态恢复且提示消失。
- 注入 HTTP 200 的 SPA HTML 后，响应被拒绝并回退到内置站点；关闭设置后画布和模型菜单仍可用。
- 三个聚焦页面场景均通过；无直接跨域 `/api/status` 请求、未捕获页面错误或非预期网络错误，也未触发生成和业务写入。
- 原有 6 个页面场景中 5 个通过；“Tuzi 账户”按钮断言失败是当前独立模式有意隐藏该入口导致的旧 harness 假设，不影响状态 HTTP/JSON 契约。另有 48 项图片生成恢复服务测试全部通过。
- 这些页面验收仅覆盖匿名状态读取和 UI 回退，不代表登录、模型鉴权、付费生成、生产部署或巡检接口已验收。两个巡检接口仍按用户决定暂缓。

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
