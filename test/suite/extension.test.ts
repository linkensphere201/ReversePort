import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

suite('Reverse Proxy Extension Integration Tests', () => {
  const config = vscode.workspace.getConfiguration('reverseProxy');
  const win = vscode.window as unknown as {
    showErrorMessage: typeof vscode.window.showErrorMessage;
    showInformationMessage: typeof vscode.window.showInformationMessage;
  };

  let fakeSshPath = '';
  let testDir = '';
  let testConfigFilePath = '';
  let originalSshPath = 'ssh';
  let originalConfigFile = 'reverse-proxy.config.json';
  let originalConnectionReadyDelayMs = 1200;

  const writeProxyConfig = (remoteBindPort: number): void => {
    fs.writeFileSync(
      testConfigFilePath,
      JSON.stringify(
        {
          remoteHost: '10.99.0.1',
          remotePort: 4001,
          remoteUser: 'yangweijian',
          remoteBindPort,
          localHost: '127.0.0.1',
          localPort: 7897,
          identityFile: ''
        },
        null,
        2
      ),
      'utf8'
    );
  };

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('local.reverse-proxy-extension');
    assert.ok(extension, 'Extension local.reverse-proxy-extension should be installed for tests');
    await extension!.activate();

    originalSshPath = config.get<string>('sshPath', 'ssh');
    originalConfigFile = config.get<string>('configFile', 'reverse-proxy.config.json');
    originalConnectionReadyDelayMs = config.get<number>('connectionReadyDelayMs', 1200);

    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reverse-proxy-ext-test-'));
    testConfigFilePath = path.join(testDir, 'reverse-proxy.config.json');
    writeProxyConfig(17897);

    fakeSshPath = path.join(testDir, 'fake-ssh.cmd');
    fs.writeFileSync(
      fakeSshPath,
      [
        '@echo off',
        'if "%1"=="-V" (',
        '  echo OpenSSH_for_Test 1>&2',
        '  exit /b 0',
        ')',
        'if /I "%RPX_FAKE_MODE%"=="port_busy" (',
        '  echo Warning: remote port forwarding failed for listen port %RPX_FAKE_BIND_PORT% 1>&2',
        '  exit /b 1',
        ')',
        'if /I "%RPX_FAKE_MODE%"=="success" (',
        '  ping 127.0.0.1 -n 30 >nul',
        '  exit /b 0',
        ')',
        'echo Unknown fake mode: %RPX_FAKE_MODE% 1>&2',
        'exit /b 1'
      ].join('\r\n'),
      'utf8'
    );
  });

  suiteTeardown(async () => {
    await config.update('sshPath', originalSshPath, vscode.ConfigurationTarget.Global);
    await config.update('configFile', originalConfigFile, vscode.ConfigurationTarget.Global);
    await config.update('connectionReadyDelayMs', originalConnectionReadyDelayMs, vscode.ConfigurationTarget.Global);
    delete process.env.RPX_FAKE_MODE;
    delete process.env.RPX_FAKE_BIND_PORT;
    await vscode.commands.executeCommand('reverseProxy.stop');
  });

  test('commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('reverseProxy.start'));
    assert.ok(commands.includes('reverseProxy.stop'));
    assert.ok(commands.includes('reverseProxy.toggle'));
  });

  test('manifest should restrict extensionKind to ui', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      extensionKind?: string[];
    };
    assert.ok(Array.isArray(manifest.extensionKind), 'extensionKind should be an array');
    assert.deepStrictEqual(manifest.extensionKind, ['ui']);
  });

  test('start command should show error when ssh does not exist', async () => {
    let capturedError = '';
    const originalShowErrorMessage = win.showErrorMessage;

    win.showErrorMessage = async (message: string) => {
      capturedError = message;
      return undefined;
    };

    try {
      await config.update('configFile', testConfigFilePath, vscode.ConfigurationTarget.Global);
      await config.update('sshPath', '__definitely_missing_ssh_binary__', vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand('reverseProxy.start');

      assert.ok(
        capturedError.includes('SSH command is unavailable'),
        `Expected SSH unavailable error message, got: ${capturedError}`
      );
    } finally {
      await config.update('sshPath', originalSshPath, vscode.ConfigurationTarget.Global);
      win.showErrorMessage = originalShowErrorMessage;
      await vscode.commands.executeCommand('reverseProxy.stop');
    }
  });

  test('start command should show error when config file path is invalid', async () => {
    const errors: string[] = [];
    const originalShowErrorMessage = win.showErrorMessage;

    win.showErrorMessage = async (message: string) => {
      errors.push(message);
      return undefined;
    };

    try {
      await config.update('configFile', path.join(testDir, 'missing-config.json'), vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand('reverseProxy.start');

      assert.ok(
        errors.some((m) => m.includes('Failed to load reverse proxy config')),
        `Expected config load error message, got: ${errors.join(' | ')}`
      );
    } finally {
      win.showErrorMessage = originalShowErrorMessage;
      await config.update('configFile', testConfigFilePath, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand('reverseProxy.stop');
    }
  });

  test('start command should show error when config file JSON is malformed', async () => {
    const errors: string[] = [];
    const originalShowErrorMessage = win.showErrorMessage;

    win.showErrorMessage = async (message: string) => {
      errors.push(message);
      return undefined;
    };

    try {
      const brokenConfigPath = path.join(testDir, 'broken-config.json');
      fs.writeFileSync(brokenConfigPath, '{\"remoteHost\": \"10.99.0.1\",', 'utf8');
      await config.update('configFile', brokenConfigPath, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand('reverseProxy.start');

      assert.ok(
        errors.some((m) => m.includes('Failed to load reverse proxy config')),
        `Expected config parse error message, got: ${errors.join(' | ')}`
      );
    } finally {
      win.showErrorMessage = originalShowErrorMessage;
      await config.update('configFile', testConfigFilePath, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand('reverseProxy.stop');
    }
  });

  test('start command should show clear error when remote port is occupied', async () => {
    const errors: string[] = [];
    const originalShowErrorMessage = win.showErrorMessage;
    const occupiedPort = 28901;

    win.showErrorMessage = async (message: string) => {
      errors.push(message);
      return undefined;
    };

    try {
      writeProxyConfig(occupiedPort);
      process.env.RPX_FAKE_MODE = 'port_busy';
      process.env.RPX_FAKE_BIND_PORT = String(occupiedPort);
      await config.update('configFile', testConfigFilePath, vscode.ConfigurationTarget.Global);
      await config.update('sshPath', fakeSshPath, vscode.ConfigurationTarget.Global);
      await config.update('connectionReadyDelayMs', 200, vscode.ConfigurationTarget.Global);

      await vscode.commands.executeCommand('reverseProxy.start');
      await new Promise((resolve) => setTimeout(resolve, 800));

      assert.ok(
        errors.some((m) => m.includes(`remote port ${occupiedPort} is already in use`)),
        `Expected occupied-port error message, got: ${errors.join(' | ')}`
      );
    } finally {
      win.showErrorMessage = originalShowErrorMessage;
      delete process.env.RPX_FAKE_MODE;
      delete process.env.RPX_FAKE_BIND_PORT;
      await vscode.commands.executeCommand('reverseProxy.stop');
    }
  });

  test('start command should show connected message when tunnel is established', async () => {
    const infos: string[] = [];
    const originalShowInformationMessage = win.showInformationMessage;

    win.showInformationMessage = async (message: string) => {
      infos.push(message);
      return undefined;
    };

    try {
      writeProxyConfig(29002);
      process.env.RPX_FAKE_MODE = 'success';
      await config.update('configFile', testConfigFilePath, vscode.ConfigurationTarget.Global);
      await config.update('sshPath', fakeSshPath, vscode.ConfigurationTarget.Global);
      await config.update('connectionReadyDelayMs', 200, vscode.ConfigurationTarget.Global);

      await vscode.commands.executeCommand('reverseProxy.start');
      await new Promise((resolve) => setTimeout(resolve, 700));

      assert.ok(
        infos.some((m) => m.includes('Reverse proxy connected.')),
        `Expected connected message, got: ${infos.join(' | ')}`
      );
    } finally {
      win.showInformationMessage = originalShowInformationMessage;
      delete process.env.RPX_FAKE_MODE;
      await vscode.commands.executeCommand('reverseProxy.stop');
    }
  });
});
