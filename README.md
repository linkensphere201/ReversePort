# Reverse Proxy VSCode Extension

在 VSCode 本地环境中管理 SSH 反向隧道（Reverse Tunnel）。

## 主要功能

- 在侧边栏 `ToolBox` -> `ReverseTunnel` 中一键开关隧道
- 状态栏显示当前状态：`Stopped` / `Starting` / `Connected` / `Failed`
- 内置日志入口（`Open Logs`）
- 内置配置入口（`Settings`）
- 启动前自动检查本机 `ssh` 命令可用性
- 远端端口占用时给出明确错误提示
- 支持在 remote-ssh 窗口中使用，SSH 进程始终在本地笔记本（UI Host）运行

## 交互说明

### 状态栏

- 文本仅展示状态
- 点击状态栏项会弹出当前状态（不执行 start/stop）

### 侧边栏

Activity Bar 图标：`ToolBox`  
视图名称：`ToolBox Status`  
分组节点：`ReverseTunnel`

子项行为：

- `ReverseTun: OFF`：点击后执行 `Start`
- `ReverseTun: ON`：点击后执行 `Stop`
- `ReverseTun: CONNECTING...`：连接中（不可点击）
- `Open Logs`：打开扩展输出日志
- `Settings`：打开/创建配置文件

## 配置

扩展设置只保留 1 项：

- `reverseProxy.configFile`（默认：`reverse-proxy.config.json`）

该设置指向 JSON 文件路径。若为相对路径：本地窗口优先按工作区解析，remote-ssh 窗口按本地用户目录解析；若未命中，则回退到扩展内置 `resources/reverse-proxy.config.json`。

运行参数位于配置文件的 `ReverseTunnel` 节点：

```json
{
  "ReverseTunnel": {
    "sshPath": "ssh",
    "connectionReadyDelayMs": 1200,
    "remoteHost": "FOO_ADDRESS",
    "remotePort": 4001,
    "remoteUser": "FOO_USER",
    "remoteBindPort": 17897,
    "localHost": "127.0.0.1",
    "localPort": 7897,
    "identityFile": ""
  }
}
```

等价 SSH 命令：

```bash
ssh -N -p 4001 -R 17897:127.0.0.1:7897 FOO_USER@FOO_ADDRESS
```

## Settings 按钮行为

当 `reverseProxy.configFile` 指向的文件不存在时：

1. 弹出目录选择框（本地窗口默认工作区目录；remote-ssh 窗口默认本地用户主目录）
2. 在所选目录创建 `configs.json`（带默认模板）
3. 自动更新 `reverseProxy.configFile` 到新文件绝对路径
4. 打开该文件供用户编辑

## 本地开发

```bash
npm install
npm run compile
npm test
```

按 `F5` 启动 Extension Development Host。

## 打包 VSIX

```bash
npx vsce package --out release-artifacts/reverse-proxy-extension-0.0.1.vsix
```

