# Tasks: 为 MiniMax-H3 增加 V1/V2 接口切换

## 1. 参数与路由

- [x] 1.1 增加 MiniMax-H3 专属接口版本参数，默认 V1
- [x] 1.2 集中实现接口版本解析及 submit/poll 路径选择

## 2. 请求链路

- [x] 2.1 让 `media-api/video-api` 按接口版本提交和轮询
- [x] 2.2 让 `video-api-service` 按接口版本提交和轮询
- [x] 2.3 确保 V1/V2 均使用 H3 JSON 请求体和正确 Base URL 策略

## 3. 验证

- [x] 3.1 补充参数显示与默认值测试
- [x] 3.2 补充 V1/V2 请求路径、请求体和轮询测试
- [x] 3.3 运行相关 Vitest、TypeScript 检查并审查最终差异
