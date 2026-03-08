# 功能清单

## 核心能力

- 通过 SSH 建立反向隧道（`-N -R`）
- 支持隧道启动、停止、状态展示、日志查看
- 启动前校验 `ssh` 可执行命令是否存在
- 识别远端端口冲突并给出明确错误
- 仅允许在本地 VSCode UI 端运行

## 交互能力

- 状态栏显示当前状态（点击只查看状态）
- 侧边栏 `ToolBox -> ToolBox Status -> ReverseTunnel` 提供操作入口
- 单按钮切换：`ReverseTun: OFF/ON/CONNECTING...`
- 附加入口：`Open Logs`、`Settings`

## 配置能力

- 扩展设置仅保留 `reverseProxy.configFile`
- 支持相对/绝对路径配置文件
- 配置文件采用 `ReverseTunnel` 一级节点结构
- 配置文件缺失时可通过 `Settings` 向导创建 `configs.json`
