"""Fixed Windows bootstrap: verify updates, launch bundled Node/worker, rollback on startup failure."""
from __future__ import annotations
import ctypes
import hashlib
import json
import os
import re
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request
from auto_update import Updates


def stop_server(process):
    if process is not None and process.poll() is None:
        process.terminate()
        try: process.wait(timeout=8)
        except subprocess.TimeoutExpired: process.kill(); process.wait()


def start_gateway(root, payload, log, app_dir, url, version):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    env = os.environ.copy(); env.pop('PORT', None); env.pop('HC_CLOUD_MODE', None); env.pop('HC_REMOTE_KEY', None)
    import winreg
    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Cryptography', 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as registry:
        machine = str(winreg.QueryValueEx(registry, 'MachineGuid')[0])
    env.update(HC_PORT=str(port), HC_BRIDGE_EXE=str(root/'bridge/hc_bridge.exe'),
        HC_BRIDGE_SCRIPT=str(payload/'client/hc_client.py'), HC_REMOTE_URL=url,
        HC_DEVICE_ID=hashlib.sha256(('HomescapesStudio:'+machine).encode()).hexdigest(),
        HC_BACKUP_DIR=str(app_dir/'backups'), HC_CONFIG_PATH=str(app_dir/'server-settings.json'),
        HC_DESKTOP_VERSION=version, PYTHONUTF8='1')
    compile((payload/'client/hc_client.py').read_text('utf8'),str(payload/'client/hc_client.py'),'exec')
    process = subprocess.Popen([str(root/'runtime/node.exe'),str(payload/'src/server/gateway.mjs')],
        cwd=payload,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,
        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({})); address=f'http://127.0.0.1:{port}'
    deadline=time.monotonic()+30
    try:
        while time.monotonic()<deadline:
            if process.poll() is not None: raise RuntimeError('Gateway stopped during startup')
            try:
                with opener.open(address+'/api/health',timeout=1) as response: state=json.load(response)
                with opener.open(address+'/',timeout=2) as response: html=response.read(65536)
                if state.get('ok') and state.get('app')=='Homescapes Save Studio' and b'<html' in html.lower():
                    for asset in re.findall(r'(?:src|href)=[\"\']([^\"\']+\.(?:js|css)(?:\?[^\"\']*)?)[\"\']', html.decode('utf8')):
                        target = urllib.parse.urljoin(address+'/',asset)
                        if urllib.parse.urlsplit(target).netloc != urllib.parse.urlsplit(address).netloc:
                            raise RuntimeError('Desktop asset must be served locally')
                        with opener.open(target,timeout=2) as resource:
                            if not resource.read(32): raise RuntimeError('Empty UI asset')
                    return process,address
            except (OSError,ValueError): pass
            time.sleep(.2)
        raise RuntimeError('Gateway did not become ready')
    except Exception: stop_server(process); raise


def main():
    root=Path(getattr(sys,'_MEIPASS',Path(__file__).resolve().parents[1]))
    app_dir=Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'HomescapesSaveStudio'
    logs=app_dir/'logs';logs.mkdir(parents=True,exist_ok=True);log_path=logs/'desktop.log'
    process=None;updates=None
    try:
        import webview
        for path in (root/'runtime/node.exe',root/'bridge/hc_bridge.exe',root/'update-pin.json'):
            if not path.is_file(): raise RuntimeError('Missing bundled file: '+str(path))
        updates=Updates(root,app_dir/'updates')
        with log_path.open('w',encoding='utf8',buffering=1) as log:
            failures=[]
            for payload,meta in updates.candidates():
                version=meta['version'] if meta else updates.pin.get('baseline_version','bundled')
                log.write('Starting desktop payload '+version+'\n')
                try:
                    process,address=start_gateway(root,payload,log,app_dir,updates.url,version)
                    updates.accept(meta)
                    break
                except Exception as error:
                    stop_server(process);process=None;updates.reject(meta);failures.append(str(error));log.write('Startup rejected: '+str(error)+'\n')
            for error in updates.errors: log.write(error+'\n')
            if process is None: raise RuntimeError('; '.join(failures) or 'No desktop payload is usable')
            webview.create_window('Homescapes Save Studio',address,width=1440,height=900,min_size=(1024,700),background_color='#0b0f17')
            webview.start(gui='edgechromium',debug=False)
        return 0
    except Exception as error:
        message=f'Could not start Homescapes Save Studio.\n\n{error}\n\nLog: {log_path}\nMicrosoft Edge WebView2 Runtime is required.'
        if os.name=='nt': ctypes.windll.user32.MessageBoxW(None,message,'Homescapes Save Studio',0x10)
        else: print(message,file=sys.stderr)
        return 1
    finally:
        stop_server(process)
        if updates: updates.cleanup()

if __name__=='__main__':
    if sys.stdout is None: sys.stdout=open(os.devnull,'w')
    if sys.stderr is None: sys.stderr=open(os.devnull,'w')
    raise SystemExit(main())
