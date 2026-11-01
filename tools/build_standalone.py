"""Build on Windows x64. Packages UI, Node and the ADB bridge into one EXE."""
from __future__ import annotations
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'desktop_build' / 'standalone'
OUT = ROOT / 'desktop_dist'


def run(*args):
    print('>', ' '.join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=ROOT, check=True)


def main():
    if os.name != 'nt' or struct.calcsize('P') != 8:
        raise RuntimeError('Run this builder with 64-bit Python on Windows.')
    node = shutil.which('node.exe')
    if not node:
        raise RuntimeError('Node.js must be installed on the BUILD machine.')
    version = subprocess.check_output([node, '-p', 'JSON.stringify({version:process.versions.node,arch:process.arch})'], text=True)
    import json
    info = json.loads(version)
    major, minor = map(int, info['version'].split('.')[:2])
    if info['arch'] != 'x64' or not (major >= 24 or major == 22 and minor >= 18):
        raise RuntimeError('Use Windows x64 Node 22.18+ or Node 24+ on the build machine.')
    # Only clear generated staging files, never the user's project or saves.
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    # Whitelist gateway modules: never package save engine, data or admin authority.
    (STAGE / 'src' / 'server').mkdir(parents=True)
    for name in ('gateway.ts', 'remote.ts', 'errors.ts'):
        shutil.copy2(ROOT / 'src' / 'server' / name, STAGE / 'src' / 'server' / name)
    shutil.copytree(ROOT / 'dist', STAGE / 'dist')
    (STAGE / 'runtime').mkdir()
    shutil.copy2(node, STAGE / 'runtime' / 'node.exe')
    (STAGE / 'package.json').write_text('{"type":"module"}', encoding='utf-8')
    # Ship the standard Android platform tools with the bridge.
    adb = ROOT / 'adb'
    if not (adb / 'adb.exe').is_file():
        archive = STAGE / 'platform-tools.zip'
        print('Downloading Android platform-tools from Google...', flush=True)
        with urllib.request.urlopen('https://dl.google.com/android/repository/platform-tools-latest-windows.zip', timeout=120) as response, archive.open('wb') as target:
            shutil.copyfileobj(response, target)
        unpack = STAGE / 'platform-tools-download'
        with zipfile.ZipFile(archive) as z:
            for member in z.infolist():
                path = Path(member.filename)
                if path.is_absolute() or '..' in path.parts:
                    raise RuntimeError('Invalid platform-tools archive path')
            z.extractall(unpack)
        adb = unpack / 'platform-tools'
    if not (adb / 'adb.exe').is_file():
        raise RuntimeError('adb.exe is missing. Place the Android platform-tools files in the project adb folder and retry.')
    pyinstaller = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean']
    bridge_dist = STAGE / 'bridge-output'
    run(*pyinstaller, '--onefile', '--console', '--name', 'hc_bridge',
        '--distpath', bridge_dist, '--workpath', STAGE / 'bridge-work', '--specpath', STAGE,
        '--add-data', f'{adb};adb', ROOT / 'client' / 'hc_client.py')
    (STAGE / 'bridge').mkdir()
    shutil.copy2(bridge_dist / 'hc_bridge.exe', STAGE / 'bridge' / 'hc_bridge.exe')
    args = [*pyinstaller, '--onefile', '--windowed', '--collect-all', 'webview',
            '--name', 'HomescapesSaveStudio', '--distpath', OUT,
            '--workpath', STAGE / 'app-work', '--specpath', STAGE]
    for folder in ('src', 'dist', 'runtime', 'bridge'):
        args.extend(['--add-data', f'{STAGE / folder};{folder}'])
    args.extend(['--add-data', f'{STAGE / "package.json"};.', ROOT / 'client' / 'desktop_launcher.py'])
    run(*args)
    print(f'\nSUCCESS: {OUT / "HomescapesSaveStudio.exe"}\nDouble-click this EXE; the API starts automatically.\nNo external Node/Python/project folder is needed on the target PC.\nMicrosoft Edge WebView2 Runtime is required.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'BUILD FAILED: {error}', file=sys.stderr)
        raise SystemExit(1)
