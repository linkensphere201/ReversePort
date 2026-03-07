# Reverse Proxy VSCode Extension

This extension starts/stops an SSH reverse proxy from VSCode.

## Commands

- `Reverse Proxy: Start`
- `Reverse Proxy: Stop`
- `Reverse Proxy: Show Status`
- `Reverse Proxy: Settings`

## Default behavior

Start command runs SSH equivalent to:

```bash
ssh -N -R 17897:127.0.0.1:7897 FOO_USER@FOO_ADDRESS -p 4001
```

## Settings

- `reverseProxy.configFile` (default: `reverse-proxy.config.json`)

All runtime values are loaded from the JSON config file instead of extension settings.

Example `reverse-proxy.config.json`:

```json
{
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
```

## SSH check

Before starting the tunnel, the extension checks whether `ssh` is executable. If not, it shows an error and does not start.

The status bar now reports:
- `Proxy: Starting`
- `Proxy: Connected`
- `Proxy: Failed`
- `Proxy: Stopped`

Click the status bar item to show current proxy status.

The Activity Bar has a `Proxy` icon. Open it to use a single toggle button:
- `ReverseTun: OFF` -> click to start
- `ReverseTun: ON` -> click to stop
- `ReverseTun: CONNECTING...` -> transitional state while connecting
- `Open Logs` -> open extension output logs
- `Settings` -> open config file editor. If configured file is missing, select a directory and the extension creates `configs.json`, then updates `reverseProxy.configFile` to that path.

If remote bind port is occupied, the extension reports a clear error (instead of only raw SSH warning logs).

## Local development

```bash
npm install
npm run compile
```

Press `F5` in VSCode to launch Extension Development Host.

