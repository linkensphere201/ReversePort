import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

let sshProcess: ChildProcessWithoutNullStreams | null = null;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let connectTimer: NodeJS.Timeout | null = null;
let stopRequested = false;
let extensionContextRef: vscode.ExtensionContext | null = null;

type ProxyState = 'stopped' | 'starting' | 'connected' | 'failed';
let proxyState: ProxyState = 'stopped';

type FileProxyConfig = {
  remoteHost: string;
  remotePort: number;
  remoteUser: string;
  remoteBindPort: number;
  localHost: string;
  localPort: number;
  identityFile: string;
};

type RuntimeProxyConfig = FileProxyConfig & {
  sshPath: string;
  connectionReadyDelayMs: number;
  loadedConfigPath: string;
};

function setProxyState(state: ProxyState): void {
  proxyState = state;

  if (state === 'starting') {
    statusBarItem.text = '$(sync~spin) Proxy: Starting';
    statusBarItem.tooltip = 'SSH reverse proxy is starting. Click to stop.';
    statusBarItem.command = 'reverseProxy.toggle';
  } else if (state === 'connected') {
    statusBarItem.text = '$(check) Proxy: Connected';
    statusBarItem.tooltip = 'SSH reverse proxy is connected. Click to stop.';
    statusBarItem.command = 'reverseProxy.toggle';
  } else if (state === 'failed') {
    statusBarItem.text = '$(error) Proxy: Failed';
    statusBarItem.tooltip = 'SSH reverse proxy failed. Click to start.';
    statusBarItem.command = 'reverseProxy.toggle';
  } else {
    statusBarItem.text = '$(debug-disconnect) Proxy: Stopped';
    statusBarItem.tooltip = 'SSH reverse proxy is stopped. Click to start.';
    statusBarItem.command = 'reverseProxy.toggle';
  }
}

function assertString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid config field '${key}': expected non-empty string.`);
  }
  return value.trim();
}

function assertNumber(value: unknown, key: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid config field '${key}': expected number.`);
  }
  return value;
}

function resolveConfigPath(configFile: string): string {
  if (path.isAbsolute(configFile)) {
    return configFile;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceFolder) {
    const workspacePath = path.join(workspaceFolder, configFile);
    if (fs.existsSync(workspacePath)) {
      return workspacePath;
    }
  }

  if (!extensionContextRef) {
    throw new Error('Extension context is not initialized.');
  }

  return path.join(extensionContextRef.extensionPath, 'resources', 'reverse-proxy.config.json');
}

function loadFileProxyConfig(filePath: string): FileProxyConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse config file '${filePath}': ${message}`);
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid config file '${filePath}': root must be a JSON object.`);
  }

  const data = raw as Record<string, unknown>;
  const identityFile = typeof data.identityFile === 'string' ? data.identityFile.trim() : '';

  return {
    remoteHost: assertString(data.remoteHost, 'remoteHost'),
    remotePort: assertNumber(data.remotePort, 'remotePort'),
    remoteUser: assertString(data.remoteUser, 'remoteUser'),
    remoteBindPort: assertNumber(data.remoteBindPort, 'remoteBindPort'),
    localHost: assertString(data.localHost, 'localHost'),
    localPort: assertNumber(data.localPort, 'localPort'),
    identityFile
  };
}

function getConfig(): RuntimeProxyConfig {
  const config = vscode.workspace.getConfiguration('reverseProxy');
  const configFile = config.get<string>('configFile', 'reverse-proxy.config.json');
  const configPath = resolveConfigPath(configFile);
  const fileConfig = loadFileProxyConfig(configPath);

  return {
    ...fileConfig,
    sshPath: config.get<string>('sshPath', 'ssh'),
    connectionReadyDelayMs: config.get<number>('connectionReadyDelayMs', 1200),
    loadedConfigPath: configPath
  };
}

function verifySshExists(sshPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = spawn(sshPath, ['-V']);

    const onData = (data: Buffer) => {
      outputChannel.appendLine(`[ssh-check] ${data.toString().trim()}`);
    };

    check.stdout.on('data', onData);
    check.stderr.on('data', onData);

    check.on('error', (err) => {
      reject(new Error(`Cannot run ssh command '${sshPath}': ${err.message}`));
    });

    check.on('close', (code) => {
      if (code === 0 || code === 255) {
        resolve();
      } else {
        reject(new Error(`ssh check exited with code ${code}`));
      }
    });
  });
}

async function startProxy(): Promise<void> {
  if (sshProcess) {
    vscode.window.showInformationMessage('Reverse proxy is already running.');
    return;
  }

  let config: RuntimeProxyConfig;
  try {
    config = getConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[error] ${message}`);
    setProxyState('failed');
    vscode.window.showErrorMessage(`Failed to load reverse proxy config: ${message}`);
    return;
  }

  const remoteTarget = `${config.remoteUser}@${config.remoteHost}`;
  const reverseSpec = `${config.remoteBindPort}:${config.localHost}:${config.localPort}`;
  outputChannel.appendLine(`[config] using file: ${config.loadedConfigPath}`);
  setProxyState('starting');

  try {
    await verifySshExists(config.sshPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[error] ${message}`);
    setProxyState('failed');
    vscode.window.showErrorMessage(
      `SSH command is unavailable. Install OpenSSH or set reverseProxy.sshPath. Details: ${message}`
    );
    return;
  }

  const args = [
    '-N',
    '-p',
    String(config.remotePort),
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'ServerAliveInterval=30',
    '-o',
    'ServerAliveCountMax=3',
    '-R',
    reverseSpec
  ];

  if (config.identityFile.length > 0) {
    args.push('-i', config.identityFile);
  }

  args.push(remoteTarget);

  outputChannel.appendLine(`[start] ${config.sshPath} ${args.join(' ')}`);

  try {
    sshProcess = spawn(config.sshPath, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[error] failed to spawn ssh: ${message}`);
    vscode.window.showErrorMessage(`Failed to start reverse proxy: ${message}`);
    sshProcess = null;
    return;
  }

  stopRequested = false;
  let hasFailed = false;
  const markFailed = (message: string): void => {
    if (hasFailed) {
      return;
    }
    hasFailed = true;
    outputChannel.appendLine(`[error] ${message}`);
    setProxyState('failed');
    vscode.window.showErrorMessage(message);
  };

  if (connectTimer) {
    clearTimeout(connectTimer);
  }
  connectTimer = setTimeout(() => {
    if (sshProcess && !hasFailed && !stopRequested) {
      setProxyState('connected');
      vscode.window.showInformationMessage('Reverse proxy connected.');
    }
  }, config.connectionReadyDelayMs);

  sshProcess.stdout.on('data', (data: Buffer) => {
    outputChannel.appendLine(`[stdout] ${data.toString().trim()}`);
  });

  sshProcess.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    outputChannel.appendLine(`[stderr] ${text}`);

    if (/remote port forwarding failed/i.test(text) || /address already in use/i.test(text)) {
      markFailed(`Reverse proxy failed: remote port ${config.remoteBindPort} is already in use.`);
      if (sshProcess) {
        sshProcess.kill();
      }
    }
  });

  sshProcess.on('error', (err: Error) => {
    markFailed(`Reverse proxy failed: ${err.message}`);
  });

  sshProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
    outputChannel.appendLine(`[stop] ssh exited with code=${code} signal=${signal}`);
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }

    if (stopRequested) {
      setProxyState('stopped');
    } else if (hasFailed) {
      // Keep failed state.
    } else if (proxyState === 'starting') {
      markFailed(`Reverse proxy failed before connection established (code=${code}, signal=${signal}).`);
    } else if (proxyState === 'connected') {
      markFailed(`Reverse proxy disconnected unexpectedly (code=${code}, signal=${signal}).`);
    } else {
      setProxyState('stopped');
    }

    sshProcess = null;
    stopRequested = false;
  });

  outputChannel.show(true);
}

function stopProxy(): void {
  if (!sshProcess) {
    vscode.window.showInformationMessage('Reverse proxy is not running.');
    return;
  }

  outputChannel.appendLine('[stop] stopping ssh reverse proxy');
  stopRequested = true;
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
  sshProcess.kill();
  sshProcess = null;
  setProxyState('stopped');
  vscode.window.showInformationMessage('Reverse proxy stopping...');
}

async function toggleProxy(): Promise<void> {
  if (sshProcess || proxyState === 'starting' || proxyState === 'connected') {
    stopProxy();
    return;
  }
  await startProxy();
}

export function activate(context: vscode.ExtensionContext): void {
  if (vscode.env.remoteName) {
    void vscode.window.showWarningMessage(
      `Reverse proxy extension only runs locally. Current remote: ${vscode.env.remoteName}`
    );
    return;
  }

  extensionContextRef = context;
  outputChannel = vscode.window.createOutputChannel('Reverse Proxy');
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  setProxyState('stopped');
  statusBarItem.show();

  context.subscriptions.push(outputChannel, statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('reverseProxy.start', async () => {
      await startProxy();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('reverseProxy.stop', () => {
      stopProxy();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('reverseProxy.toggle', async () => {
      await toggleProxy();
    })
  );
}

export function deactivate(): void {
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
  if (sshProcess) {
    sshProcess.kill();
    sshProcess = null;
  }
}
