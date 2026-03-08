# TODO

## 近期

- 增加端口可用性预检查（本地与远端）
- 增加连接重试策略和退避机制
- 补充更多异常文案（认证失败、网络不可达）
- 在侧边栏展示最近一次错误摘要

## 测试

- 增加更完整的 e2e（真实 ssh mock/stub）
- 增加跨平台路径/编码测试（Windows/macOS/Linux）
- 增加配置迁移与损坏恢复测试

## 工程化

- 增加 CI：lint + compile + test + package
- 增加版本发布脚本（自动更新 changelog）
- 抽离 `extension.ts` 中状态与进程逻辑到独立模块
