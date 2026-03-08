# 设计架构

## 模块划分

- 入口：`src/extension.ts`
- 状态机：`stopped | starting | connected | failed`
- 进程管理：`spawn(sshPath, args)` 管理 ssh 子进程
- 视图层：StatusBar + TreeDataProvider（侧边栏）
- 配置层：`reverseProxy.configFile` + JSON 文件解析
- 日志层：VSCode OutputChannel
- 测试层：`test/suite/extension.test.ts`

## 数据流

1. 用户点击侧边栏 toggle
2. 根据当前状态执行 `startProxy` 或 `stopProxy`
3. `startProxy` 读取配置并校验 `ssh`
4. 拉起 ssh 子进程并监听 stdout/stderr/close/error
5. 更新状态栏与侧边栏显示
6. 输出日志并在异常时弹窗

## 配置解析

- 配置文件根节点必须包含 `ReverseTunnel`
- 字段校验：字符串非空、数字合法、连接延迟 > 0
- 相对路径优先从工作区解析，不存在时回退扩展资源目录

## 错误处理

- 配置缺失/格式错误：`Failed to load reverse proxy config`
- ssh 不可用：提示安装 OpenSSH 或调整 `sshPath`
- 端口占用：明确提示远端 bind 端口冲突
- 非预期中断：根据阶段区分连接前失败/连接后断开
