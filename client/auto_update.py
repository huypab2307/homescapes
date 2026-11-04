"""Signed desktop payload updates. Immutable bootstrap; verified cache; atomic activation."""
from __future__ import annotations
import base64
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import urllib.parse
import urllib.request
import zipfile
from cryptography.hazmat.primitives.serialization import load_der_public_key
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

BOOTSTRAP = 1
MAX_ZIP = 32 * 1024 * 1024
MAX_EXPANDED = 128 * 1024 * 1024
FIELDS = ('schema', 'release', 'version', 'sha256', 'size', 'min_bootstrap', 'url')
REQUIRED = {'dist/index.html', 'src/server/gateway.mjs', 'client/hc_client.py', 'package.json'}
ALLOWED_CODE = REQUIRED - {'dist/index.html'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Redirected update rejected')

def origin(url: str, allow_http=False) -> str:
    parsed = urllib.parse.urlsplit(url)
    local = allow_http and parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost')
    if (parsed.scheme != 'https' and not local) or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
        raise ValueError('An HTTPS server origin is required')
    return url.rstrip('/')

def fetch(url, limit, timeout=12):
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'HomescapesBootstrap/1'})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Update download exceeds limit')
    return data

def verify_manifest(meta, public_key):
    if not isinstance(meta, dict): raise ValueError('Invalid update manifest')
    for key in ('schema', 'release', 'size', 'min_bootstrap'):
        if type(meta.get(key)) is not int: raise ValueError('Invalid manifest integer')
    if meta['schema'] != 1 or not 0 < meta['release'] < 2**53 or not 0 < meta['size'] <= MAX_ZIP:
        raise ValueError('Invalid release schema or size')
    if meta['min_bootstrap'] > BOOTSTRAP or meta['min_bootstrap'] < 1: raise ValueError('A newer bootstrap EXE is required')
    digest = meta.get('sha256', '')
    if not isinstance(digest, str) or not re.fullmatch('[a-f0-9]{64}', digest): raise ValueError('Invalid update digest')
    if meta.get('version') != digest[:16] or meta.get('url') != '/desktop/bundles/' + digest + '.zip': raise ValueError('Invalid update URL/version')
    payload = json.dumps({k: meta[k] for k in FIELDS}, separators=(',', ':'), ensure_ascii=True).encode()
    key = load_der_public_key(base64.b64decode(public_key, validate=True))
    if not isinstance(key, Ed25519PublicKey): raise ValueError('Expected Ed25519 update key')
    key.verify(base64.b64decode(meta.get('signature', ''), validate=True), payload)
    return meta

def validate_archive(data, meta):
    if len(data) != meta['size'] or hashlib.sha256(data).hexdigest() != meta['sha256']:
        raise ValueError('Update checksum/size mismatch')
    archive = zipfile.ZipFile(io.BytesIO(data))
    seen = set(); total = 0
    for item in archive.infolist():
        name = item.filename; path = PurePosixPath(name)
        if item.is_dir() or '\\' in name or ':' in name or path.is_absolute() or '..' in path.parts or str(path) != name:
            raise ValueError('Unsafe archive path')
        if name in seen or stat.S_ISLNK(item.external_attr >> 16): raise ValueError('Duplicate/symlink archive entry')
        if not (name in ALLOWED_CODE or name.startswith('dist/')): raise ValueError('Unexpected update file')
        if name.startswith('dist/') and path.suffix.lower() not in ('.html','.js','.css','.png','.jpg','.jpeg','.webp','.svg','.gif','.ico','.woff','.woff2','.ttf','.json','.avif'):
            raise ValueError('Unsupported UI asset type')
        total += item.file_size
        if total > MAX_EXPANDED or len(seen) > 12000: raise ValueError('Expanded update too large')
        seen.add(name)
    if not REQUIRED.issubset(seen): raise ValueError('Incomplete update payload')
    return archive

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.state-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf8') as target: json.dump(value, target)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp): os.unlink(temp)

class Updates:
    def __init__(self, bundled_root: Path, state_dir: Path, allow_http=False):
        self.bundled = bundled_root; self.state = state_dir; self.state.mkdir(parents=True, exist_ok=True)
        self.pin = json.loads((bundled_root / 'update-pin.json').read_text('utf8'))
        self.url = origin(self.pin['server_url'], allow_http)
        self.public_key = self.pin['public_key']
        self.minimum = int(self.pin.get('min_release', 0))
        self.errors = []; self.temporary = []
        self.good = None
        try:
            self.good = verify_manifest(json.loads((self.state / 'last-good.json').read_text('utf8')), self.public_key)
            if self.good['release'] < self.minimum: self.good = None
        except Exception: pass
        try: self.bad = set(json.loads((self.state / 'rejected.json').read_text('utf8')))
        except Exception: self.bad = set()

    def archive_path(self, meta): return self.state / (meta['sha256'] + '.zip')

    def extract(self, meta, data):
        archive = validate_archive(data, meta)
        folder = Path(tempfile.mkdtemp(prefix='run-', dir=self.state)); self.temporary.append(folder)
        # Re-extract verified ZIP each launch instead of trusting cached executable files.
        with archive:
            for item in archive.infolist():
                target = folder / item.filename; target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(item))
        return folder

    def candidates(self):
        offered = None
        try:
            offered = verify_manifest(json.loads(fetch(self.url + '/desktop/manifest.json', 16384)), self.public_key)
            if offered['release'] < self.minimum: raise ValueError('Release older than bundled baseline rejected')
            if self.good and offered['release'] < self.good['release']: raise ValueError('Older release rejected')
            if self.good and offered['release'] == self.good['release'] and offered['sha256'] != self.good['sha256']: raise ValueError('Conflicting release rejected')
            if offered['sha256'] in self.bad: raise ValueError('Previously failing release skipped')
            path = self.archive_path(offered)
            data = path.read_bytes() if path.exists() else fetch(self.url + offered['url'], MAX_ZIP, timeout=120)
            folder = self.extract(offered, data)
            # Cache only after cryptographic and archive validation succeeded.
            if not path.exists():
                fd, temp = tempfile.mkstemp(prefix='download-', dir=self.state)
                try:
                    with os.fdopen(fd, 'wb') as target: target.write(data)
                    os.replace(temp, path)
                finally:
                    if os.path.exists(temp): os.unlink(temp)
            yield folder, offered
        except Exception as error: self.errors.append('Update check: ' + (str(error) or type(error).__name__))
        if self.good and self.good['sha256'] not in self.bad and (not offered or offered['sha256'] != self.good['sha256']):
            try: yield self.extract(self.good, self.archive_path(self.good).read_bytes()), self.good
            except Exception as error: self.errors.append('Cached update: ' + (str(error) or type(error).__name__))
        yield self.bundled / 'baseline', None

    def accept(self, meta):
        if meta:
            atomic_json(self.state / 'last-good.json', meta); self.good = meta
            keep = meta['sha256']
            # Keep at most a few archives; never touch saves or backup folders.
            archives = sorted(self.state.glob('*.zip'), key=lambda p: p.stat().st_mtime, reverse=True)
            for file in archives[3:]:
                if file.stem != keep:
                    try: file.unlink()
                    except OSError: pass

    def reject(self, meta):
        if meta:
            self.bad.add(meta['sha256']); atomic_json(self.state / 'rejected.json', sorted(self.bad)[-100:])

    def cleanup(self):
        for folder in self.temporary: shutil.rmtree(folder, ignore_errors=True)
