# Change: 为 MiniMax-H3 增加 V1/V2 接口切换

## Why

MiniMax-H3 当前固定通过官方 V2 视频接口提交和轮询，但 Tuzi 同时提供使用相同 H3 JSON 请求体的 `/v1/videos` 兼容入口。用户需要在生成参数面板中显式选择接口版本，以便按供应商运行情况切换，同时保持分辨率、时长、比例和内容结构一致。

## What Changes

- 仅为 `MiniMax-H3` 增加“接口版本”参数，提供 `V2` 和 `V1` 两个选项
- 默认使用 `V1`；用户可手动切换到 `V2`
- V1 提交使用 `POST /v1/videos`，请求体仍为 H3 JSON：`model/content/duration/resolution/ratio`
- V2 保持 `POST /v2/video_generation` 和 `GET /v2/query/video_generation/{task_id}`
- V1 使用对应的 `/v1/videos/{task_id}` 状态查询路径
- 两条现有视频调用链共享相同的版本解析和路径选择逻辑

## Impact

- Affected specs:
  - `provider-routing`
- Affected code:
  - `packages/drawnix/src/constants/model-config.ts`
  - `packages/drawnix/src/services/video-binding-utils.ts`
  - `packages/drawnix/src/services/media-api/video-api.ts`
  - `packages/drawnix/src/services/video-api-service.ts`
  - 相关单元测试

## Compatibility

- 其他视频模型不显示该参数，也不改变现有路径、请求体或轮询行为
- 未保存过接口版本的 MiniMax-H3 任务默认使用 V1
- V1 和 V2 均发送 `application/json`，不复用通用 multipart 视频请求体
