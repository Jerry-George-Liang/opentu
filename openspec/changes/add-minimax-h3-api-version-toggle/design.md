## Context

MiniMax-H3 已有专用 JSON 请求构造与 V2 submit/poll 路径，但路径选择目前仅由模型 ID 决定。现有 `ParametersDropdown` 会根据 `ParamConfig` 自动渲染枚举型分段按钮，并将选择值放入任务 `params`，适合承载接口版本选择。

## Goals / Non-Goals

- Goals:
  - 在 MiniMax-H3 参数面板中提供明确的 V1/V2 切换
  - 两个版本复用同一 H3 JSON 参数结构
  - 提交和轮询始终使用同一版本
  - 默认使用 V1，并保持其他模型行为不变
- Non-Goals:
  - 不允许用户输入任意视频接口路径
  - 不修改供应商配置或全局协议绑定
  - 不为其他视频模型增加接口版本切换

## Decisions

- Decision: 使用模型参数 `api_version` 表达选择
  - 该值沿用现有参数持久化、兼容性过滤和任务传递链路
  - 允许值严格限制为 `v1`、`v2`，缺失或非法值回退到 `v1`

- Decision: V1/V2 共享 H3 JSON 构造器
  - 两个入口都发送 `model/content/duration/resolution/ratio`
  - 不复用通用 `FormData` 分支，避免 `size=1280x720` 等协议错配再次出现

- Decision: 版本选择同时决定提交和轮询路径
  - V1: `POST /v1/videos`，`GET /v1/videos/{task_id}`
  - V2: `POST /v2/video_generation`，`GET /v2/query/video_generation/{task_id}`
  - 两个版本均对供应商 Base URL 使用去除末尾 `/v1` 后再拼绝对版本路径的策略

## Risks / Trade-offs

- 历史任务没有 `api_version`：统一回退 V1。
- 提交后任务参数若被修改可能导致轮询错用版本：执行配置必须携带提交时的参数快照，测试覆盖 submit/poll 一致性。
- V1 返回结构可能与 V2 有包装差异：继续使用现有 MiniMax-H3 响应归一化，并补充 V1 响应用例。

## Verification

- 参数配置测试：MiniMax-H3 显示接口版本且默认 V1，其他模型不显示
- 请求测试：V1/V2 分别命中正确 submit/poll URL，均为 JSON H3 请求体
- 回归测试：`768P`、`2K`、时长、比例及参考图内容不因切换而丢失
- 类型检查和相关 Vitest 用例
