# -*- coding: utf-8 -*-
"""
Homescapes Save Studio - Windows client.

Two roles, one file:

  * ADB bridge  — the Node server calls it as a subprocess in JSON mode:
        python client/hc_client.py devices
        python client/hc_client.py pull   --serial <s> [--out <path>]
        python client/hc_client.py push   --serial <s> --in <path> [--no-restart]
        python client/hc_client.py force-stop --serial <s>
        python client/hc_client.py start  --serial <s>
        python client/hc_client.py restore-backup --serial <s>
      Every command prints exactly one JSON object on stdout.

  * Desktop shell — `python client/hc_client.py` with no arguments opens a
      native WebView2 window over the local studio server and exposes
      `window.hcNative` so the UI can drive ADB without a local HTTP round
      trip. (Requires the optional `pywebview` dependency.)

NO save algorithm lives here. All edit logic is server-side; this file only
moves bytes between the PC and the device. That split is deliberate: the
client is the part that ships to users, and it must not be able to corrupt a
save on its own.

The ADB helpers below (adb discovery, privileged pull fallbacks, on-device
path discovery, shell-error classification) are adapted from the proven
IGG VIP Studio client, re-targeted at Homescapes.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

APP_NAME = "Homescapes Save Studio"
APP_VERSION = "0.1.0"

# Prefer the original package; use the Vietnamese edition as a fallback.
GAME_PACKAGES = ["com.playrix.homescapes", "com.playrix.homescapes.vn"]

# Confirmed from the reference editor's game descriptor and from the sample:
# the save is a JSON container sitting in the package's private storage.
SAVE_FILE = "SaveGame.db"
BACKUP_FILE = "SaveGame.db.bak"      # written by the GAME itself
TOOL_BACKUP_SUFFIX = ".hcsbak"       # our own pre-edit snapshot; the game never reads it

# Fallbacks only — the real path is discovered on the device (see _find_on_device).
_SAVE_SUBDIRS = ("", "files", "saves", "app_data")
_SAVE_BASES = (
    "/data/data/{pkg}",
    "/data/user/0/{pkg}",
    "/data/user_de/0/{pkg}",
    "/sdcard/Android/data/{pkg}/files",
    "/storage/emulated/0/Android/data/{pkg}/files",
)


def candidate_paths_for_package(pkg: str, filename: str) -> list[str]:
    """Candidate on-device paths for `filename`, most likely first."""
    out: list[str] = []
    for base in _SAVE_BASES:
        root = base.format(pkg=pkg)
        for sub in _SAVE_SUBDIRS:
            path = f"{root}/{sub}/{filename}" if sub else f"{root}/{filename}"
            if path not in out:
                out.append(path)
    return out


# Real device paths discovered per (serial, package, filename), so a later
# push writes back to exactly where the pull came from.
_PATH_CACHE: dict[tuple[str, str, str], str] = {}
# Which package each device actually uses, so push targets the same one.
_ACTIVE_PACKAGE: dict[str, str] = {}


# ── adb discovery ────────────────────────────────────────────────────────────

_EMULATOR_PORTS = [5555, 5554, 62001, 62025, 21503, 7555]


def _find_adb() -> str | None:
    """Locate adb: bundled first, then PATH, then common emulator installs."""
    here = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    candidates: list[Path] = [here / "adb" / "adb.exe", here / "adb.exe"]

    on_path = shutil.which("adb")
    if on_path:
        candidates.append(Path(on_path))

    local = os.environ.get("LOCALAPPDATA", "")
    roaming = os.environ.get("APPDATA", "")
    pf = os.environ.get("ProgramFiles", "C:\\Program Files")
    pfx = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")
    home = str(Path.home())
    desktop = str(Path.home() / "Desktop")

    candidates += [
        Path(local) / "Android" / "Sdk" / "platform-tools" / "adb.exe",
        Path(pf) / "Android" / "platform-tools" / "adb.exe",
        Path(pf) / "Microvirt" / "MEmu" / "adb.exe",
        Path(pfx) / "Microvirt" / "MEmu" / "adb.exe",
        Path(local) / "Microvirt" / "MEmu" / "adb.exe",
        Path(roaming) / "Microvirt" / "MEmu" / "adb.exe",
        Path(pf) / "LDPlayer" / "adb.exe",
        Path(pf) / "LDPlayer" / "LDPlayer9" / "adb.exe",
        Path(pf) / "ldplayer9box" / "adb.exe",
        Path(pf) / "ldplayerbox" / "adb.exe",
        Path(pfx) / "LDPlayer" / "LDPlayer9" / "adb.exe",
        Path(local) / "LDPlayer" / "LDPlayer9" / "adb.exe",
        Path(local) / "ldplayer9box" / "adb.exe",
        Path(pf) / "Nox" / "bin" / "adb.exe",
        Path(pfx) / "Nox" / "bin" / "adb.exe",
        Path(local) / "Programs" / "BlueStacks_nxt" / "HD-Adb.exe",
        Path(pf) / "BlueStacks_nxt" / "HD-Adb.exe",
        Path(pfx) / "BlueStacks_nxt" / "HD-Adb.exe",
        Path(local) / "Genymobile" / "Genymotion" / "tools" / "adb.exe",
        Path(home) / "platform-tools" / "adb.exe",
        Path(desktop) / "platform-tools" / "adb.exe",
        Path(home) / "Downloads" / "platform-tools" / "adb.exe",
    ]

    for c in candidates:
        try:
            if c and c.exists():
                return str(c)
        except OSError:
            continue
    return None


def _run_adb(adb: str, args: list[str], timeout: int = 30) -> tuple[int, bytes, bytes]:
    try:
        proc = subprocess.run(
            [adb] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        return 124, b"", b"adb timed out"
    except OSError as exc:
        return 1, b"", str(exc).encode("utf-8", "replace")


def _adb_devices(adb: str) -> list[dict]:
    code, out, _ = _run_adb(adb, ["devices"])
    if code != 0:
        return []
    result: list[dict] = []
    for line in out.decode("utf-8", "replace").splitlines()[1:]:
        line = line.strip()
        if not line or "\t" not in line:
            continue
        serial, state = line.split("\t", 1)
        if state.strip() == "device":
            result.append({"id": serial.strip(), "label": serial.strip()})
    return result


def _ensure_adb_ready(adb: str) -> list[dict]:
    """Start the adb server and auto-connect well-known emulator ports."""
    _run_adb(adb, ["start-server"], timeout=20)
    devices = _adb_devices(adb)
    if devices:
        return devices
    for port in _EMULATOR_PORTS:
        _run_adb(adb, ["connect", f"127.0.0.1:{port}"], timeout=8)
    return _adb_devices(adb)


# ── payload validation ───────────────────────────────────────────────────────

_PRINTABLE = frozenset(range(0x20, 0x7F)) | {0x09, 0x0A, 0x0D}
_SHELL_ERR_RE = re.compile(
    r"(permission denied|no such file|not found|is a directory|read-only"
    r"|operation not permitted|inaccessible|unknown option|not debuggable"
    r"|syntax error|usage:)",
    re.I,
)


def looks_like_save(buf: bytes) -> bool:
    """True when `buf` is a Homescapes save rather than shell diagnostics.

    Homescapes writes either plain JSON (leading `{` after whitespace) or an
    XOR-wrapped binary container. `adb exec-out` merges stderr into stdout, so
    a failed privileged read returns English text of arbitrary length — that
    text must never be accepted as a save.
    """
    if not buf or len(buf) < 16:
        return False
    head = buf[:512]
    if any(b == 0 for b in head):
        return True  # binary container
    if any(b not in _PRINTABLE for b in head):
        return True  # binary container
    stripped = head.lstrip(b"\xef\xbb\xbf \t\r\n")
    if stripped.startswith(b"{"):
        return True  # plain JSON
    return False


def _looks_like_shell_error(buf: bytes) -> bool:
    if not buf:
        return False
    if len(buf) > 64 and looks_like_save(buf):
        return False
    return bool(_SHELL_ERR_RE.search(buf[:200].decode("utf-8", "replace")))


# ── privileged I/O ───────────────────────────────────────────────────────────

def _pull_privileged(adb: str, serial: str, remote: str, diag: list[str] | None = None) -> bytes | None:
    """Read `remote` as root, trying every access path that emulators allow."""
    notes: list[str] = []

    def accept(out: bytes) -> bytes | None:
        if looks_like_save(out):
            return out
        text = out[:200].decode("utf-8", "replace").strip()
        if text:
            notes.append(text)
        return None

    for args in (
        ["-s", serial, "exec-out", "su", "-c", f"cat '{remote}'"],
        ["-s", serial, "exec-out", "su", "0", "cat", remote],
        ["-s", serial, "exec-out", "su", "-c", f'cat "{remote}"'],
    ):
        code, out, _ = _run_adb(adb, args, timeout=60)
        if code == 0:
            ok = accept(out)
            if ok is not None:
                return ok

    if remote.startswith("/data/data/"):
        pkg = remote.split("/data/data/")[1].split("/")[0]
        rel = remote.split(f"/data/data/{pkg}/", 1)[1]
        for args in (
            ["-s", serial, "exec-out", "run-as", pkg, "cat", rel],
            ["-s", serial, "exec-out", "su", "-c", f"run-as {pkg} cat {rel}"],
        ):
            code, out, _ = _run_adb(adb, args, timeout=60)
            if code == 0:
                ok = accept(out)
                if ok is not None:
                    return ok

    # Last resort: copy to a world-readable temp file, then adb pull it.
    tmp = "/data/local/tmp/hcs_pull_tmp.bin"
    code, _, _ = _run_adb(
        adb,
        ["-s", serial, "shell", f"su -c 'cp \"{remote}\" {tmp} && chmod 644 {tmp}'"],
        timeout=30,
    )
    if code == 0:
        with tempfile.TemporaryDirectory() as td:
            local = Path(td) / "pull.bin"
            code2, _, _ = _run_adb(adb, ["-s", serial, "pull", tmp, str(local)], timeout=60)
            if code2 == 0 and local.exists():
                ok = accept(local.read_bytes())
                if ok is not None:
                    return ok

    if diag is not None:
        diag.extend(notes)
    return None


def _find_on_device(adb: str, serial: str, pkg: str, filename: str) -> str | None:
    """Ask the device where `filename` really lives. Needs root."""
    roots = " ".join(
        base.format(pkg=pkg)
        for base in (
            "/data/data/{pkg}",
            "/data/user/0/{pkg}",
            "/data/user_de/{pkg}",
            "/sdcard/Android/data/{pkg}",
            "/storage/emulated/0/Android/data/{pkg}",
        )
    )
    scripts = [
        f"find {roots} -maxdepth 5 -name {filename} -type f 2>/dev/null | head -n 5",
        f"find {roots} -maxdepth 5 -iname '*{filename}*' -type f 2>/dev/null | head -n 10",
    ]
    for script in scripts:
        for args in (
            ["-s", serial, "exec-out", "su", "-c", script],
            ["-s", serial, "shell", f"su -c '{script}'"],
        ):
            code, out, _ = _run_adb(adb, args, timeout=25)
            if code != 0 or not out or _looks_like_shell_error(out):
                continue
            for line in out.decode("utf-8", "replace").splitlines():
                path = line.strip().lstrip("﻿")
                if path.startswith("/") and path.endswith(filename):
                    return path
    return None


def _is_pkg_installed(adb: str, serial: str, pkg: str) -> bool:
    code, out, _ = _run_adb(adb, ["-s", serial, "shell", "pm", "path", pkg], timeout=10)
    return code == 0 and b"package:" in out


def _packages_for(serial: str) -> list[str]:
    preferred = _ACTIVE_PACKAGE.get(serial)
    out: list[str] = []
    for p in [preferred, *GAME_PACKAGES]:
        if p and p not in out:
            out.append(p)
    return out


# ── bridge ───────────────────────────────────────────────────────────────────

class ClientError(RuntimeError):
    """Raised for anything the user can act on; message is shown verbatim."""


class HomescapesClient:
    def adb_info(self) -> dict:
        adb = _find_adb()
        if not adb:
            return {"found": False, "path": "", "devices": [], "message": "adb not found"}
        devices = _ensure_adb_ready(adb)
        return {
            "found": True,
            "path": adb,
            "devices": devices,
            "message": "ok" if devices else "adb found but no device connected",
        }

    def devices(self) -> list[dict]:
        adb = _find_adb()
        if not adb:
            return []
        return _ensure_adb_ready(adb)

    def force_stop(self, serial: str) -> dict:
        adb = _find_adb()
        if not adb:
            return {"ok": False, "package": "", "error": "adb not found"}
        errs: list[str] = []
        for pkg in _packages_for(serial):
            if not _is_pkg_installed(adb, serial, pkg):
                errs.append(f"{pkg}: package not installed")
                continue
            code, _, err = _run_adb(
                adb, ["-s", serial, "shell", "am", "force-stop", pkg], timeout=10
            )
            if code == 0:
                _ACTIVE_PACKAGE[serial] = pkg
                return {"ok": True, "package": pkg}
            errs.append(f"{pkg}: {err.decode('utf-8', 'replace').strip()}")
        return {"ok": False, "package": "", "error": " | ".join(errs)}

    def start(self, serial: str) -> dict:
        adb = _find_adb()
        if not adb:
            raise ClientError("adb not found")
        err = b"no supported package installed"
        for pkg in _packages_for(serial):
            if not _is_pkg_installed(adb, serial, pkg):
                continue
            code, _, err = _run_adb(
                adb,
                [
                    "-s", serial, "shell", "monkey", "-p", pkg,
                    "-c", "android.intent.category.LAUNCHER", "1",
                ],
                timeout=15,
            )
            if code == 0:
                _ACTIVE_PACKAGE[serial] = pkg
                return {"ok": True, "package": pkg}
        raise ClientError("could not launch Homescapes: " + err.decode("utf-8", "replace").strip())

    def _read_save(self, adb: str, serial: str, pkg: str) -> tuple[str, bytes] | None:
        diag: list[str] = []
        known = _PATH_CACHE.get((serial, pkg, SAVE_FILE))
        discovered = _find_on_device(adb, serial, pkg, SAVE_FILE)
        ordered: list[str] = []
        for path in (discovered, known, *candidate_paths_for_package(pkg, SAVE_FILE)):
            if path and path not in ordered:
                ordered.append(path)
        for remote in ordered:
            buf = _pull_privileged(adb, serial, remote, diag)
            if buf and len(buf) >= 16:
                _PATH_CACHE[(serial, pkg, SAVE_FILE)] = remote
                return remote, buf
        return None

    def pull(self, serial: str, out_path: str | None = None, stop_first: bool = False) -> dict:
        """Read SaveGame.db off the device. Returns base64 plus provenance."""
        adb = _find_adb()
        if not adb:
            raise ClientError("adb not found - connect an emulator first")
        errs: list[str] = []
        for pkg in GAME_PACKAGES:
            if not _is_pkg_installed(adb, serial, pkg):
                errs.append(f"{pkg}: package not installed")
                continue
            found = self._read_save(adb, serial, pkg)
            if found:
                remote, buf = found
                _ACTIVE_PACKAGE[serial] = pkg
                if stop_first:
                    stopped = self.force_stop(serial)
                    if not stopped.get('ok') or stopped.get('package') != pkg:
                        raise ClientError('could not stop the selected package before snapshot')
                    time.sleep(0.4)
                    snapshot = self._read_save(adb, serial, pkg)
                    if not snapshot or snapshot[0] != remote:
                        raise ClientError('save source changed after stopping the game')
                    remote, buf = snapshot
                if out_path:
                    Path(out_path).write_bytes(buf)
                return {
                    "ok": True,
                    "b64": base64.b64encode(buf).decode("ascii"),
                    "file": remote,
                    "package": pkg,
                    "size": len(buf),
                    "plainJson": buf.lstrip(b"\xef\xbb\xbf \t\r\n").startswith(b"{"),
                    "savedTo": out_path or "",
                }
            errs.append(f"{pkg}: could not read {SAVE_FILE} in any known folder")
        raise ClientError(
            "Could not read SaveGame.db. Tried: " + " | ".join(errs)
            + ". Check that the device is rooted and open Homescapes at least once."
        )

    def push(self, serial: str, data: bytes, restart: bool = True, require_backup: bool = False, expected_package: str | None = None, expected_file: str | None = None) -> dict:
        """Write an edited save back, keeping both a game and a tool backup."""
        adb = _find_adb()
        if not adb:
            raise ClientError("adb not found - connect an emulator first")
        if len(data) < 16:
            raise ClientError("save output too short to push")
        if not looks_like_save(data):
            raise ClientError(
                "refusing to push: the payload is not a Homescapes save "
                "(it looks like text or an error message)"
            )
        if len(data) > 64 * 1024 * 1024:
            raise ClientError("save output exceeds the 64 MB safety limit")

        # Each CLI call is a fresh process: resolve the readable save again in
        # original -> VN order, and pin all writes/relaunches to that package.
        selected_pkg = None
        if expected_package and expected_package not in GAME_PACKAGES:
            raise ClientError('unsupported target package')
        for pkg in ([expected_package] if expected_package else GAME_PACKAGES):
            if _is_pkg_installed(adb, serial, pkg) and self._read_save(adb, serial, pkg):
                selected_pkg = pkg
                _ACTIVE_PACKAGE[serial] = pkg
                break
        if selected_pkg is None:
            raise ClientError("could not find a readable save in either supported Homescapes package")

        if expected_file and _PATH_CACHE.get((serial, selected_pkg, SAVE_FILE)) != expected_file:
            raise ClientError('save path changed; refusing to write')
        # Stop the game first, or it will overwrite our write when it saves.
        stop = self.force_stop(serial)
        if not stop.get("ok"):
            raise ClientError("could not stop Homescapes: " + str(stop.get("error")))
        time.sleep(0.4)

        with tempfile.TemporaryDirectory() as td:
            local = Path(td) / SAVE_FILE
            local.write_bytes(data)
            tmp = "/data/local/tmp/hcs_push.bin"
            code, _, err = _run_adb(adb, ["-s", serial, "push", str(local), tmp], timeout=60)
            if code != 0:
                raise ClientError(
                    "adb push failed: " + err.decode("utf-8", "replace").strip()
                )

            errs: list[str] = []
            for pkg in [selected_pkg]:
                save_path = _PATH_CACHE.get((serial, pkg, SAVE_FILE)) or candidate_paths_for_package(pkg, SAVE_FILE)[0]
                bak_path = save_path.replace(SAVE_FILE, BACKUP_FILE)
                tool_bak = save_path + TOOL_BACKUP_SUFFIX
                # Snapshot whatever is there NOW (pre-edit) to our own file,
                # leave the game's .bak to the game, then install the edit.
                shell = (
                    f"su -c 'cp \"{save_path}\" \"{tool_bak}\" 2>/dev/null; "
                    f"cp \"{tmp}\" \"{save_path}\"; "
                    f"chmod 600 \"{save_path}\" \"{tool_bak}\"'"
                )
                if require_backup:
                    # Backup must succeed before any destructive replacement.
                    shell = (f"su -c 'cp \"{save_path}\" \"{tool_bak}\" && "
                             f"cp \"{tmp}\" \"{save_path}\" && "
                             f"chmod 600 \"{save_path}\" \"{tool_bak}\"'")
                code2, out2, err2 = _run_adb(adb, ["-s", serial, "shell", shell], timeout=30)
                combined = (out2 + err2).decode("utf-8", "replace").strip()
                rejected = re.search(
                    r"permission denied|not found|no such file|failed|error:",
                    combined,
                    re.I,
                )
                if code2 == 0 and not rejected:
                    _ACTIVE_PACKAGE[serial] = pkg
                    if restart:
                        self.start(serial)
                    return {
                        "ok": True,
                        "package": pkg,
                        "file": save_path,
                        "toolBackup": tool_bak,
                        "gameBackup": bak_path,
                        "size": len(data),
                        "relaunched": bool(restart),
                    }
                errs.append(f"{pkg}: {combined or 'su cp failed'}")
            raise ClientError("Push failed — " + " | ".join(errs))

    @staticmethod
    def _validate_fresh_snapshot(snapshot: dict) -> tuple[str, str, dict]:
        pkg = snapshot.get('package')
        path = snapshot.get('file')
        files = snapshot.get('files')
        allowed = (SAVE_FILE, SAVE_FILE + '.bak', SAVE_FILE + '.buf')
        if pkg not in GAME_PACKAGES or not isinstance(path, str):
            raise ClientError('invalid backup source')
        roots = [base.format(pkg=pkg).rstrip('/') + '/' for base in _SAVE_BASES]
        if not path.endswith('/' + SAVE_FILE) or not any(path.startswith(root) for root in roots) or '..' in path.split('/') or any(c in path for c in ("\x00", "\r", "\n", "'", '"', "$", "`", "\\")):
            raise ClientError('invalid backup path')
        if not isinstance(files, dict) or set(files) != set(allowed):
            raise ClientError('incomplete backup')
        decoded = {}; total = 0
        for name in allowed:
            value = files[name]
            if value is None:
                decoded[name] = None
            elif isinstance(value, str):
                try: decoded[name] = base64.b64decode(value, validate=True)
                except Exception as error: raise ClientError('invalid backup data') from error
                total += len(decoded[name])
            else: raise ClientError('invalid backup data')
        if decoded[SAVE_FILE] is None or total > 64 * 1024 * 1024:
            raise ClientError('invalid backup size')
        return pkg, path, decoded

    def _fresh_stop(self, serial: str, pkg: str):
        _ACTIVE_PACKAGE[serial] = pkg
        stopped = self.force_stop(serial)
        if not stopped.get('ok') or stopped.get('package') != pkg:
            raise ClientError('could not stop selected game')
        time.sleep(0.4)

    def _fresh_read_files(self, adb: str, serial: str, path: str) -> dict:
        parent = path.rsplit('/', 1)[0]
        files = {}
        for name in (SAVE_FILE, SAVE_FILE + '.bak', SAVE_FILE + '.buf'):
            remote = parent + '/' + name
            shell = f"su -c 'if [ -e \"{remote}\" ]; then echo PRESENT; else echo ABSENT; fi'"
            code, out, _ = _run_adb(adb, ['-s', serial, 'shell', shell], timeout=15)
            if code != 0 or out.strip() not in (b'PRESENT', b'ABSENT'):
                raise ClientError('could not inspect save files')
            if out.strip() == b'ABSENT': files[name] = None; continue
            content = _pull_privileged(adb, serial, remote)
            if content is None: raise ClientError('could not back up save files')
            files[name] = base64.b64encode(content).decode('ascii')
        return files

    def fresh_snapshot(self, serial: str, pkg: str, path: str) -> dict:
        adb = _find_adb()
        if not adb or pkg not in GAME_PACKAGES or not _is_pkg_installed(adb, serial, pkg):
            raise ClientError('selected game unavailable')
        # Validate the pinned source before constructing any shell command.
        placeholder = {SAVE_FILE: '', SAVE_FILE + '.bak': None, SAVE_FILE + '.buf': None}
        self._validate_fresh_snapshot({'package': pkg, 'file': path, 'files': placeholder})
        self._fresh_stop(serial, pkg)
        found = self._read_save(adb, serial, pkg)
        if not found or found[0] != path: raise ClientError('save source changed; connect again')
        files = self._fresh_read_files(adb, serial, path)
        snapshot = {'ok': True, 'schema': 1, 'serial': serial, 'package': pkg, 'file': path, 'files': files}
        self._validate_fresh_snapshot(snapshot)
        return snapshot

    def _fresh_restore_files(self, adb: str, serial: str, pkg: str, path: str, files: dict):
        parent = path.rsplit('/', 1)[0]
        code, out, _ = _run_adb(adb, ['-s', serial, 'shell', f"su -c 'stat -c %u:%g \"{parent}\"'"], timeout=15)
        owner = out.decode('ascii', 'ignore').strip()
        if code != 0 or not re.fullmatch(r'\d+:\d+', owner): raise ClientError('could not determine save ownership')
        with tempfile.TemporaryDirectory() as td:
            for index, (name, content) in enumerate(files.items()):
                remote = parent + '/' + name
                if content is None:
                    shell = f"su -c 'rm -f \"{remote}\"'"
                else:
                    local = Path(td) / name; local.write_bytes(content)
                    transfer = '/data/local/tmp/hcs_restore_' + str(index) + '.bin'
                    code, _, _ = _run_adb(adb, ['-s', serial, 'push', str(local), transfer], timeout=60)
                    if code != 0: raise ClientError('backup upload failed')
                    shell = f"su -c 'cp \"{transfer}\" \"{remote}\" && chown {owner} \"{remote}\" && chmod 600 \"{remote}\"'"
                code, out, err = _run_adb(adb, ['-s', serial, 'shell', shell], timeout=30)
                if code != 0 or re.search(rb'permission denied|failed|error:', out + err, re.I): raise ClientError('backup restore failed')

    def fresh_start(self, serial: str, snapshot: dict, restore: bool = False) -> dict:
        pkg, path, files = self._validate_fresh_snapshot(snapshot)
        if snapshot.get('serial') != serial: raise ClientError('backup belongs to another device')
        adb = _find_adb()
        if not adb or not _is_pkg_installed(adb, serial, pkg): raise ClientError('selected game unavailable')
        self._fresh_stop(serial, pkg)
        if restore:
            self._fresh_restore_files(adb, serial, pkg, path, files)
        else:
            current = self._fresh_read_files(adb, serial, path)
            if current != snapshot['files']: raise ClientError('save files changed after backup; connect again')
            parent = path.rsplit('/', 1)[0]
            targets = ' '.join('"' + parent + '/' + name + '"' for name in files)
            shell = f"su -c 'rm -f {targets} && for f in {targets}; do [ ! -e \"$f\" ] || exit 1; done'"
            code, out, err = _run_adb(adb, ['-s', serial, 'shell', shell], timeout=30)
            if code != 0 or re.search(rb'permission denied|failed|error:', out + err, re.I):
                try: self._fresh_restore_files(adb, serial, pkg, path, files)
                except Exception: pass
                raise ClientError('fresh start failed; original backup retained')
        _ACTIVE_PACKAGE[serial] = pkg
        self.start(serial)
        return {'ok': True, 'package': pkg, 'file': path, 'relaunched': True}

    def restore_backup(self, serial: str) -> dict:
        """Restore the last tool snapshot, including a discovered non-default save path."""
        adb = _find_adb()
        if not adb:
            raise ClientError("adb not found")
        for pkg in _packages_for(serial):
            found = _find_on_device(adb, serial, pkg, SAVE_FILE)
            candidates = []
            for path in (found, _PATH_CACHE.get((serial, pkg, SAVE_FILE)), *candidate_paths_for_package(pkg, SAVE_FILE)):
                if path and path not in candidates:
                    candidates.append(path)
            for save_path in candidates:
                tool_bak = save_path + TOOL_BACKUP_SUFFIX
                code, out, _ = _run_adb(adb, ["-s", serial, "shell", f"su -c 'ls \"{tool_bak}\"'"], timeout=15)
                if code != 0 or not out.strip():
                    continue
                _ACTIVE_PACKAGE[serial] = pkg
                stopped = self.force_stop(serial)
                if not stopped.get('ok') or stopped.get('package') != pkg:
                    raise ClientError('could not stop the selected game before restoring')
                shell = f"su -c 'cp \"{tool_bak}\" \"{save_path}\" && chmod 600 \"{save_path}\"'"
                code2, out2, err2 = _run_adb(adb, ["-s", serial, "shell", shell], timeout=30)
                combined = (out2 + err2).decode("utf-8", "replace").strip()
                if code2 == 0 and not re.search(r"permission denied|failed|error:", combined, re.I):
                    self.start(serial)
                    return {"ok": True, "file": save_path, "restoredFrom": tool_bak}
                raise ClientError(f"restore failed: {combined or 'su cp failed'}")
        raise ClientError("no tool backup found on this device yet")


# ── CLI (JSON in / JSON out) ─────────────────────────────────────────────────

def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _cli(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="hc_client", add_help=True)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("devices")
    sub.add_parser("adb-info")

    p_pull = sub.add_parser("pull")
    p_pull.add_argument("--serial", required=True)
    p_pull.add_argument("--out", default=None)
    p_pull.add_argument("--stop-first", action="store_true")

    p_push = sub.add_parser("push")
    p_push.add_argument("--serial", required=True)
    p_push.add_argument("--in", dest="infile", required=True)
    p_push.add_argument("--no-restart", action="store_true")
    p_push.add_argument("--require-backup", action="store_true")
    p_push.add_argument("--expect-package", default=None)
    p_push.add_argument("--expect-file", default=None)

    p_stop = sub.add_parser("force-stop")
    p_stop.add_argument("--serial", required=True)

    p_start = sub.add_parser("start")
    p_start.add_argument("--serial", required=True)

    p_restore = sub.add_parser("restore-backup")
    p_restore.add_argument("--serial", required=True)

    p_snapshot = sub.add_parser('fresh-start-snapshot')
    p_snapshot.add_argument('--serial', required=True)
    p_snapshot.add_argument('--expect-package', required=True)
    p_snapshot.add_argument('--expect-file', required=True)
    for command in ('fresh-start', 'fresh-start-restore'):
        entry = sub.add_parser(command)
        entry.add_argument('--serial', required=True)
        entry.add_argument('--snapshot', required=True)

    args = parser.parse_args(argv)
    client = HomescapesClient()

    try:
        if args.cmd == "devices":
            _emit({"ok": True, "devices": client.devices()})
        elif args.cmd == "adb-info":
            _emit({"ok": True, "info": client.adb_info()})
        elif args.cmd == "pull":
            _emit(client.pull(args.serial, args.out, stop_first=args.stop_first))
        elif args.cmd == "push":
            data = Path(args.infile).read_bytes()
            _emit(client.push(args.serial, data, restart=not args.no_restart, require_backup=args.require_backup, expected_package=args.expect_package, expected_file=args.expect_file))
        elif args.cmd == "force-stop":
            _emit(client.force_stop(args.serial))
        elif args.cmd == "start":
            _emit(client.start(args.serial))
        elif args.cmd == 'fresh-start-snapshot':
            _emit(client.fresh_snapshot(args.serial, args.expect_package, args.expect_file))
        elif args.cmd in ('fresh-start', 'fresh-start-restore'):
            source = Path(args.snapshot)
            if source.stat().st_size > 96 * 1024 * 1024: raise ClientError('backup is too large')
            snapshot = json.loads(source.read_text('utf8'))
            _emit(client.fresh_start(args.serial, snapshot, restore=args.cmd == 'fresh-start-restore'))
        elif args.cmd == "restore-backup":
            _emit(client.restore_backup(args.serial))
        else:  # pragma: no cover - argparse enforces choices
            parser.error(f"unknown command {args.cmd}")
        return 0
    except ClientError as exc:
        _emit({"ok": False, "error": str(exc)})
        return 1
    except Exception as exc:  # noqa: BLE001 - the bridge must never crash the host
        _emit({"ok": False, "error": f"{type(exc).__name__}: {exc}"})
        return 1


# ── desktop shell ────────────────────────────────────────────────────────────

def _serve_window() -> int:
    """Open a native WebView2 window over the local studio server."""
    try:
        import webview  # pywebview
    except ImportError:
        sys.stderr.write(
            "pywebview is not installed. Either:\n"
            "  pip install pywebview\n"
            "or run the bridge in JSON mode (pass a command such as `devices`).\n"
        )
        return 2

    url = os.environ.get("HC_STUDIO_URL", "http://127.0.0.1:8787")
    window = webview.create_window(
        APP_NAME,
        url,
        width=1440,
        height=900,
        min_size=(1024, 700),
        background_color="#0b0f17",
    )
    # Expose the bridge so the UI can drive ADB without an HTTP hop.
    window.expose(HomescapesClient())
    webview.start(debug=bool(os.environ.get("HC_DEBUG")))
    return 0


def main() -> int:
    # In a windowed (no-console) build these are None, and any library that
    # writes to them raises AttributeError and kills the app on startup.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")  # noqa: SIM115
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")  # noqa: SIM115

    argv = sys.argv[1:]
    if not argv:
        return _serve_window()
    return _cli(argv)


if __name__ == "__main__":
    raise SystemExit(main())
