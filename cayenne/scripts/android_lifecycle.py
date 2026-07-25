"""Cayenne-owned Android/Expo runtime lifecycle.

All process termination is restricted to PIDs persisted by a Cayenne run.
"""
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import time
import urllib.parse
import urllib.request
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

AVD = "Medium_Phone_API_36.1"
DEVICE = "emulator-5554"
PACKAGE = "com.buffago.app"
RUNTIME_FAILURES = {
    "ADB_START_FAILURE",
    "ADB_OFFLINE_TIMEOUT",
    "EMULATOR_START_FAILURE",
    "EMULATOR_BOOT_TIMEOUT",
    "METRO_START_FAILURE",
    "METRO_TIMEOUT",
    "DEV_CLIENT_CONNECTION_FAILURE",
    "BUNDLE_LOAD_FAILURE",
}


class RuntimeFailure(RuntimeError):
    def __init__(self, category: str, message: str) -> None:
        if category not in RUNTIME_FAILURES:
            raise ValueError(f"unknown runtime failure category: {category}")
        super().__init__(message)
        self.category = category


@dataclass
class OwnedProcess:
    role: str
    pid: int
    executable: str
    started_at: float
    log: str


def canonical_android_tools(env: dict[str, str] | None = None, which: Callable[[str], str | None] = shutil.which):
    env = os.environ if env is None else env
    roots = [Path(env[k]).resolve() for k in ("ANDROID_HOME", "ANDROID_SDK_ROOT") if env.get(k)]
    roots = list(dict.fromkeys(roots))
    if not roots:
        raise RuntimeFailure("ADB_START_FAILURE", "ANDROID_HOME or ANDROID_SDK_ROOT must identify the Android SDK.")
    if len(roots) > 1:
        raise RuntimeFailure("ADB_START_FAILURE", f"ANDROID_HOME and ANDROID_SDK_ROOT disagree: {roots}")
    root = roots[0]
    adb = (root / "platform-tools" / "adb.exe").resolve()
    emulator = (root / "emulator" / "emulator.exe").resolve()
    missing = [str(p) for p in (adb, emulator) if not p.is_file()]
    if missing:
        raise RuntimeFailure("ADB_START_FAILURE", "Canonical Android tools are missing: " + ", ".join(missing))
    warnings: list[str] = []
    for name, canonical in (("adb", adb), ("emulator", emulator)):
        resolved = which(name)
        if resolved and Path(resolved).resolve() != canonical:
            warnings.append(f"Duplicate {name} binary on PATH: {Path(resolved).resolve()} (canonical: {canonical})")
    return adb, emulator, warnings


class AndroidLifecycle:
    def __init__(
        self,
        root: Path,
        run_dir: Path,
        *,
        device: str = DEVICE,
        sleep: Callable[[float], None] = time.sleep,
        popen=subprocess.Popen,
        runner=subprocess.run,
    ) -> None:
        self.root = root.resolve()
        self.run_dir = run_dir.resolve()
        self.device = device
        self.sleep = sleep
        self.popen = popen
        self.runner = runner
        self.runtime_dir = self.run_dir / "runtime"
        self.logs_dir = self.run_dir / "logs"
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.manifest = self.runtime_dir / "processes.json"
        self.owned: list[OwnedProcess] = []
        self.adb, self.emulator, self.warnings = canonical_android_tools()

    def _run(self, args, timeout=30, env=None):
        try:
            result = self.runner(
                [str(x) for x in args], cwd=self.root, capture_output=True, text=True,
                encoding="utf-8", errors="replace", timeout=timeout, check=False, env=env,
            )
            return result.returncode, (result.stdout or "") + (result.stderr or "")
        except (OSError, subprocess.TimeoutExpired) as exc:
            return 127, str(exc)

    def _adb(self, *args, timeout=30):
        return self._run([self.adb, *args], timeout=timeout)

    def dump_hierarchy(self):
        """Return a bounded UI hierarchy without relying on /dev/tty output."""
        remote = "/sdcard/cayenne-window.xml"
        rc, output = self._adb("-s", self.device, "shell", "uiautomator", "dump", remote, timeout=30)
        if rc != 0:
            return rc, output
        return self._adb("-s", self.device, "exec-out", "cat", remote, timeout=30)

    def _persist(self):
        self.manifest.write_text(
            json.dumps({"owner": "cayenne", "runDirectory": str(self.run_dir), "processes": [asdict(p) for p in self.owned]}, indent=2) + "\n",
            encoding="utf-8",
        )

    def _record(self, role: str, process, executable: Path, log: Path):
        item = OwnedProcess(role, int(process.pid), str(executable.resolve()), time.time(), str(log.resolve()))
        self.owned.append(item)
        self._persist()
        return process

    def recover_stale_owned(self, artifact_root: Path):
        """Terminate only live PIDs recorded by older Cayenne manifests."""
        for manifest in artifact_root.glob("*/runtime/processes.json"):
            if manifest.resolve() == self.manifest:
                continue
            try:
                data = json.loads(manifest.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if data.get("owner") != "cayenne":
                continue
            for proc in data.get("processes", []):
                pid = int(proc.get("pid", 0))
                if pid <= 0:
                    continue
                # Windows process identity is checked before termination to avoid PID-reuse damage.
                query = subprocess.run(
                    ["powershell", "-NoProfile", "-Command",
                     f"$p=Get-CimInstance Win32_Process -Filter \"ProcessId={pid}\" -ErrorAction SilentlyContinue;"
                     "if($p){$p.ExecutablePath}"],
                    capture_output=True, text=True, check=False,
                )
                actual = (query.stdout or "").strip()
                expected = str(proc.get("executable", ""))
                if actual and expected and Path(actual).resolve() == Path(expected).resolve():
                    subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, check=False)
            try:
                data["cleaned"] = True
                manifest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            except OSError:
                pass

    def start_adb(self):
        rc, output = self._adb("start-server")
        (self.logs_dir / "adb-start.log").write_text(output, encoding="utf-8")
        if rc != 0:
            raise RuntimeFailure("ADB_START_FAILURE", f"adb start-server failed: {output.strip()}")
        rc, output = self._adb("devices")
        if rc != 0:
            raise RuntimeFailure("ADB_START_FAILURE", f"ADB daemon did not answer on port 5037: {output.strip()}")
        return {"status": "STARTED", "warnings": self.warnings}

    def device_state(self):
        rc, output = self._adb("devices")
        if rc != 0:
            return "unavailable"
        for line in output.splitlines():
            parts = line.strip().split()
            if parts and parts[0] == self.device:
                return parts[1] if len(parts) > 1 else "unknown"
        return "missing"

    def start_emulator(self):
        if self.device_state() == "device":
            return {"status": "ALREADY_RUNNING", "avd": AVD}
        rc, avds = self._run([self.emulator, "-list-avds"])
        if rc != 0 or AVD not in {line.strip() for line in avds.splitlines()}:
            raise RuntimeFailure("EMULATOR_START_FAILURE", f"Configured AVD {AVD} was not found. Available: {avds.strip()}")
        stdout_path = self.logs_dir / "emulator.stdout.log"
        stderr_path = self.logs_dir / "emulator.stderr.log"
        stdout = stdout_path.open("w", encoding="utf-8")
        stderr = stderr_path.open("w", encoding="utf-8")
        try:
            flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            process = self.popen(
                [str(self.emulator), f"@{AVD}", "-no-snapshot-load", "-port", "5554"],
                cwd=self.root, stdout=stdout, stderr=stderr, creationflags=flags,
            )
        except OSError as exc:
            stdout.close(); stderr.close()
            raise RuntimeFailure("EMULATOR_START_FAILURE", str(exc)) from exc
        self._record("emulator", process, self.emulator, stdout_path)
        return {"status": "STARTED", "avd": AVD, "pid": process.pid, "arguments": ["-no-snapshot-load", "-port", "5554"]}

    def wait_for_device(self, attempts=45, interval=2):
        reconnect_done = False
        restart_done = False
        states = []
        for _ in range(attempts):
            state = self.device_state()
            states.append(state)
            if state == "device":
                return {"status": "RECOVERED" if reconnect_done or restart_done else "CONNECTED", "states": states, "reconnect": reconnect_done, "adbRestart": restart_done}
            if state == "offline":
                if not reconnect_done:
                    self._adb("reconnect", "offline")
                    reconnect_done = True
                elif not restart_done and states.count("offline") >= 4:
                    self._adb("kill-server")
                    rc, output = self._adb("start-server")
                    if rc != 0:
                        raise RuntimeFailure("ADB_START_FAILURE", output.strip())
                    restart_done = True
            self.sleep(interval)
        raise RuntimeFailure("ADB_OFFLINE_TIMEOUT", f"{self.device} did not become online; observed states: {states[-10:]}")

    def wait_for_boot(self, attempts=90, interval=2):
        for _ in range(attempts):
            rc, output = self._adb("-s", self.device, "shell", "getprop", "sys.boot_completed")
            if rc == 0 and output.strip() == "1":
                return {"status": "BOOTED"}
            self.sleep(interval)
        raise RuntimeFailure("EMULATOR_BOOT_TIMEOUT", f"{self.device} did not report sys.boot_completed=1")

    def verify_package(self):
        rc, output = self._adb("-s", self.device, "shell", "pm", "path", PACKAGE)
        if rc != 0 or "package:" not in output:
            raise RuntimeFailure("DEV_CLIENT_CONNECTION_FAILURE", f"{PACKAGE} is not installed on {self.device}")
        return {"status": "INSTALLED", "package": PACKAGE}

    def _metro_ready(self):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8081/status", timeout=2) as response:
                return response.status == 200 and "packager-status:running" in response.read().decode("utf-8", "replace")
        except Exception:
            return False

    def _port_pid(self, port=8081):
        command = (
            f"$c=Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1;"
            "if($c){$c.OwningProcess}"
        )
        result = subprocess.run(["powershell", "-NoProfile", "-Command", command], capture_output=True, text=True, check=False)
        return int(result.stdout.strip()) if result.stdout.strip().isdigit() else None

    def start_metro(self, attempts=60, interval=2):
        if self._metro_ready():
            return {"status": "ALREADY_RUNNING", "pid": self._port_pid()}
        occupant = self._port_pid()
        if occupant:
            raise RuntimeFailure("METRO_START_FAILURE", f"Port 8081 is owned by PID {occupant}, but it is not a valid Expo Metro server.")
        expo = self.root / "crawl" / "node_modules" / ".bin" / "expo.cmd"
        if not expo.is_file():
            raise RuntimeFailure("METRO_START_FAILURE", f"Expo CLI is missing: {expo}")
        log_path = self.logs_dir / "metro.log"
        log = log_path.open("w", encoding="utf-8")
        env = os.environ.copy()
        env["EXPO_NO_INTERACTIVE"] = "1"
        try:
            flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            process = self.popen(
                ["cmd", "/c", str(expo), "start", "--dev-client", "--localhost", "--port", "8081"],
                cwd=self.root / "crawl", stdout=log, stderr=subprocess.STDOUT, env=env, creationflags=flags,
            )
        except OSError as exc:
            log.close()
            raise RuntimeFailure("METRO_START_FAILURE", str(exc)) from exc
        self._record("metro", process, Path(os.environ.get("COMSPEC", "C:/Windows/System32/cmd.exe")), log_path)
        for _ in range(attempts):
            if process.poll() is not None:
                raise RuntimeFailure("METRO_START_FAILURE", f"Expo exited with code {process.returncode}; see {log_path}")
            if self._metro_ready():
                return {"status": "STARTED", "pid": process.pid, "log": str(log_path)}
            self.sleep(interval)
        raise RuntimeFailure("METRO_TIMEOUT", f"Metro did not become ready; see {log_path}")

    def prewarm_bundle(self):
        """Build the cold Android bundle before the dev client's short HTTP timeout."""
        url = (
            "http://127.0.0.1:8081/node_modules/expo-router/entry.bundle"
            "?platform=android&dev=true&hot=false&lazy=true"
            "&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app"
        )
        try:
            with urllib.request.urlopen(url, timeout=300) as response:
                while response.read(1024 * 1024):
                    pass
                if response.status != 200:
                    raise RuntimeFailure("BUNDLE_LOAD_FAILURE", f"Metro bundle prewarm returned HTTP {response.status}")
        except RuntimeFailure:
            raise
        except Exception as exc:
            raise RuntimeFailure("BUNDLE_LOAD_FAILURE", f"Metro could not prebuild the Android bundle: {exc}") from exc
        return {"status": "PREWARMED", "entry": "node_modules/expo-router/entry.bundle"}

    def connect_dev_client(self, attempts=60, interval=2):
        rc, output = self._adb("-s", self.device, "reverse", "tcp:8081", "tcp:8081")
        if rc != 0:
            raise RuntimeFailure("DEV_CLIENT_CONNECTION_FAILURE", f"adb reverse failed: {output.strip()}")
        metro_url = "http://127.0.0.1:8081"
        # Expo development builds register exp+<configured scheme>; the plain
        # application scheme is reserved for Buffago's own deep links.
        dev_url = "exp+buffago://expo-development-client/?url=" + urllib.parse.quote(metro_url, safe="")
        self._adb("-s", self.device, "shell", "am", "force-stop", PACKAGE)
        self._adb("-s", self.device, "logcat", "-c")
        rc, output = self._adb(
            "-s", self.device, "shell", "am", "start", "-W",
            "-a", "android.intent.action.VIEW", "-d", dev_url, "-p", PACKAGE, timeout=45,
        )
        if rc != 0 or "Error:" in output:
            raise RuntimeFailure("DEV_CLIENT_CONNECTION_FAILURE", f"Unable to open development-client URL: {output.strip()}")
        evidence = {"status": "CONNECTED", "url": dev_url, "reverse": "tcp:8081"}
        hierarchy = ""
        focus = ""
        errors = ""
        for attempt in range(attempts):
            rc, pid = self._adb("-s", self.device, "shell", "pidof", PACKAGE)
            _, focus = self._adb("-s", self.device, "shell", "dumpsys", "activity", "activities")
            if attempt % 5 == 0:
                self._adb("-s", self.device, "shell", "uiautomator", "dump", "/sdcard/cayenne-window.xml")
                _, hierarchy = self._adb("-s", self.device, "exec-out", "cat", "/sdcard/cayenne-window.xml")
                # First-boot Google/Android permission surfaces can cover the
                # real app even though the JS bundle is healthy. Resolve the
                # bounded, known prompts without invoking Maestro.
                for label in ("No thanks", "While using the app", "Allow", "Not now", "Continue", "Close"):
                    match = re.search(
                        rf'(?:text|content-desc)="{re.escape(label)}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
                        hierarchy,
                        re.IGNORECASE,
                    )
                    if match:
                        x1, y1, x2, y2 = map(int, match.groups())
                        self._adb("-s", self.device, "shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
                        hierarchy = ""
                        break
            log_args = ["-s", self.device, "logcat", "-d", "-v", "brief", "-t", "600"]
            if pid.strip().isdigit():
                log_args.extend(["--pid", pid.strip()])
            _, errors = self._adb(*log_args)
            fatal = any(marker in errors for marker in ("FATAL EXCEPTION", "AndroidRuntime: FATAL", "ReactNativeJS: Error:", "ReactNativeJS: Invariant Violation"))
            focus_lines = "\n".join(line for line in focus.splitlines() if "mCurrentFocus" in line or "mResumedActivity" in line)
            launcher = "expo.modules.devlauncher" in focus_lines.lower() or "development build" in hierarchy.lower()
            selector = "app.root" in hierarchy or "BuffaGo app root" in hierarchy
            if rc == 0 and pid.strip() and not launcher and selector and not fatal:
                evidence.update({"pid": pid.strip(), "selector": "app.root", "launcherForeground": False, "fatalError": False})
                return evidence
            if fatal:
                raise RuntimeFailure("BUNDLE_LOAD_FAILURE", "Fatal AndroidRuntime or ReactNativeJS error while loading the bundle.")
            if "DevLauncherErrorActivity" in focus_lines:
                raise RuntimeFailure("BUNDLE_LOAD_FAILURE", "Expo development client displayed its bundle error activity.")
            self.sleep(interval)
        (self.logs_dir / "dev-client-focus.txt").write_text(focus, encoding="utf-8")
        (self.logs_dir / "dev-client-hierarchy.xml").write_text(hierarchy, encoding="utf-8")
        (self.logs_dir / "dev-client-logcat.txt").write_text(errors, encoding="utf-8")
        raise RuntimeFailure("DEV_CLIENT_CONNECTION_FAILURE", "Buffago did not replace the Expo launcher with a real app.root selector.")

    def cleanup(self):
        cleaned = []
        for proc in reversed(self.owned):
            result = subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True, check=False)
            if result.returncode == 0:
                cleaned.append(proc.pid)
        return {"status": "PASSED", "ownedPids": [p.pid for p in self.owned], "cleanedPids": cleaned}
