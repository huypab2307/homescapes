"""Self-contained desktop entry point: bundled Node + API + WebView2."""
from __future__ import annotations
import ctypes
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request


def stop_server(process):
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def main():
    root = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[1]))
    log_dir = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'HomescapesSaveStudio' / 'logs'
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / 'desktop.log'
    process = None
    try:
        import webview
        node = root / 'runtime' / 'node.exe'
        server = root / 'src' / 'server' / 'gateway.ts'
        bridge = root / 'bridge' / 'hc_bridge.exe'
        for path in (node, server, bridge, root / 'dist' / 'index.html'):
            if not path.is_file():
                raise RuntimeError(f'Missing bundled file: {path}')
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        env = os.environ.copy()
        env.pop('PORT', None)
        env.pop('HC_CLOUD_MODE', None)
        env.update(HC_PORT=str(port), HC_BRIDGE_EXE=str(bridge), PYTHONUTF8='1',
                   HC_CONFIG_PATH=str(log_dir.parent / 'server-settings.json'))
        # Stable machine binding; the raw Windows MachineGuid never leaves this PC.
        import hashlib
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Cryptography', 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as registry:
            machine_guid = str(winreg.QueryValueEx(registry, 'MachineGuid')[0])
        env['HC_DEVICE_ID'] = hashlib.sha256(('HomescapesStudio:' + machine_guid).encode()).hexdigest()
        env['HC_REMOTE_URL'] = 'https://homescapes-save-api.onrender.com'
        env.pop('HC_REMOTE_KEY', None)
        with log_path.open('w', encoding='utf-8') as log:
            process = subprocess.Popen(
                [str(node), '--experimental-strip-types', str(server)],
                cwd=str(root), env=env, stdin=subprocess.DEVNULL,
                stdout=log, stderr=subprocess.STDOUT,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
            )
            # Ignore system proxy settings for the application's loopback API.
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            url = f'http://127.0.0.1:{port}'
            deadline = time.monotonic() + 60
            ready = False
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError('The bundled API stopped during startup.')
                try:
                    with opener.open(url + '/api/health', timeout=1) as response:
                        state = json.load(response)
                    if state.get('ok') and state.get('app') == 'Homescapes Save Studio':
                        ready = True
                        break
                except (OSError, ValueError):
                    pass
                time.sleep(0.2)
            if not ready:
                raise RuntimeError('The bundled API did not become ready in 60 seconds.')
            webview.create_window('Homescapes Save Studio', url, width=1440, height=900,
                                  min_size=(1024, 700), background_color='#0b0f17')
            webview.start(gui='edgechromium', debug=False)
        return 0
    except Exception as error:
        message = (f'Could not start Homescapes Save Studio.\n\n{error}\n\n'
                   f'Log: {log_path}\n\nMicrosoft Edge WebView2 Runtime must be installed.')
        if os.name == 'nt':
            ctypes.windll.user32.MessageBoxW(None, message, 'Homescapes Save Studio', 0x10)
        else:
            print(message, file=sys.stderr)
        return 1
    finally:
        stop_server(process)


if __name__ == '__main__':
    if sys.stdout is None:
        sys.stdout = open(os.devnull, 'w')
    if sys.stderr is None:
        sys.stderr = open(os.devnull, 'w')
    raise SystemExit(main())
