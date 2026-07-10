from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


SAFE_PLACEHOLDERS = {
    "",
    "changeme",
    "dummy",
    "example",
    "example-key",
    "fake",
    "placeholder",
    "redacted",
    "replace-me",
    "sample",
    "test-access-token",
    "test-api-key",
    "test-key",
    "test-token",
    "your_api_key_here",
    "your_openai_key_here",
    "your_secret_here",
}


HIGH_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("openai_key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("github_token", re.compile(r"\b(?:ghp_|github_pat_|gho_|ghu_|ghs_)[A-Za-z0-9_]{16,}\b")),
    ("aws_access_key_id", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("meta_access_token", re.compile(r"\bEAA[A-Za-z0-9]{20,}\b")),
    ("jwt", re.compile(r"\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b")),
    ("private_key", re.compile(r"BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY")),
    ("bearer_token", re.compile(r"Bearer\s+([A-Za-z0-9._\-]{20,})")),
    ("db_url_with_password", re.compile(r"\b(?:postgres|postgresql|mysql|mongodb|mongodb\+srv)://[^/\s:@]+:[^@\s]+@")),
]


MEDIUM_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("credential_assignment", re.compile(r"\b(?:API_KEY|ACCESS_TOKEN|CLIENT_SECRET|PASSWORD|PRIVATE_KEY|WEBHOOK_SECRET|TOKEN)\b\s*[:=]\s*([^\s#'\"`]+)", re.I)),
    ("secret_query_param", re.compile(r"[?&](?:access_token|api_key|token|secret|password)=([^&\s]+)", re.I)),
    ("authorization_header", re.compile(r"Authorization\s*[:=]\s*Bearer\s+([A-Za-z0-9._\-]{12,})", re.I)),
    ("long_secretish_value", re.compile(r"\b(?:secret|token|password|key)\b[^=\n]{0,20}[:=]\s*([A-Za-z0-9+/=_\-]{16,})", re.I)),
]


@dataclass(frozen=True)
class Finding:
    severity: str
    kind: str
    location: str
    masked: str


def _run_git(args: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=cwd, check=False, text=True, capture_output=True)


def _repo_root(start: Path) -> Path:
    proc = _run_git(["rev-parse", "--show-toplevel"], cwd=start)
    if proc.returncode != 0:
        raise SystemExit(proc.stderr.strip() or "Unable to resolve Git repository root.")
    return Path(proc.stdout.strip())


def _mask(value: str) -> str:
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def _is_placeholder(value: str) -> bool:
    normalized = value.strip().strip("\"'`").lower()
    if normalized in SAFE_PLACEHOLDERS:
        return True
    if normalized.startswith("your_") and normalized.endswith("_here"):
        return True
    if normalized.startswith("test-"):
        return True
    if normalized in {"none", "null", "false", "true"}:
        return True
    return False


def _sanitize_line(line: str, patterns: Iterable[tuple[str, re.Pattern[str]]]) -> str:
    sanitized = line
    for _, pattern in patterns:
        def repl(match: re.Match[str]) -> str:
            candidate = match.group(1) if match.lastindex else match.group(0)
            if _is_placeholder(candidate):
                return match.group(0)
            return match.group(0).replace(candidate, _mask(candidate))

        sanitized = pattern.sub(repl, sanitized)
    return sanitized


def _scan_text(text: str, location: str, *, include_medium: bool = True) -> list[Finding]:
    findings: list[Finding] = []
    all_patterns = HIGH_PATTERNS + (MEDIUM_PATTERNS if include_medium else [])
    for line_number, line in enumerate(text.splitlines(), start=1):
        for severity, patterns in (("high", HIGH_PATTERNS), ("medium", MEDIUM_PATTERNS)):
            if severity == "medium" and not include_medium:
                continue
            for kind, pattern in patterns:
                match = pattern.search(line)
                if not match:
                    continue
                candidate = match.group(1) if match.lastindex else match.group(0)
                if _is_placeholder(candidate):
                    continue
                findings.append(
                    Finding(
                        severity=severity,
                        kind=kind,
                        location=f"{location}:{line_number}",
                        masked=_sanitize_line(line, all_patterns),
                    )
                )
                break
    return findings


def _scan_tracked_files(repo_root: Path) -> list[Finding]:
    proc = _run_git(["ls-files", "-z"], cwd=repo_root)
    if proc.returncode != 0:
        raise SystemExit(proc.stderr.strip() or "git ls-files failed")
    findings: list[Finding] = []
    for path_str in proc.stdout.split("\0"):
        if not path_str:
            continue
        path = repo_root / Path(path_str)
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        findings.extend(_scan_text(text, path_str))
    return findings


def _scan_history(repo_root: Path) -> list[Finding]:
    rev_list = _run_git(["rev-list", "--all"], cwd=repo_root)
    if rev_list.returncode != 0:
        raise SystemExit(rev_list.stderr.strip() or "git rev-list failed")
    findings: list[Finding] = []
    grep_args: list[str] = ["grep", "-nI", "-P"]
    for _, pattern in HIGH_PATTERNS:
        grep_args.extend(["-e", pattern.pattern])
    for commit in rev_list.stdout.splitlines():
        if not commit.strip():
            continue
        proc = _run_git([*grep_args, commit, "--"], cwd=repo_root)
        if proc.returncode not in (0, 1):
            raise SystemExit(proc.stderr.strip() or f"git grep failed for {commit}")
        if proc.returncode == 1:
            continue
        for raw_line in proc.stdout.splitlines():
            if not raw_line:
                continue
            parts = raw_line.split(":", 2)
            if len(parts) != 3:
                continue
            file_path, line_no, line_text = parts
            findings.extend(_scan_text(line_text, f"{commit}:{file_path}", include_medium=False))
    return findings


def _print_findings(title: str, findings: list[Finding]) -> None:
    print(title)
    if not findings:
        print("  none")
        return
    for finding in findings:
        print(f"  [{finding.severity}] {finding.location} {finding.kind} | {finding.masked}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan Jalapeno tracked files and optionally Git history for secrets.")
    parser.add_argument("--history", action="store_true", help="Also scan all Git history.")
    args = parser.parse_args(argv)

    repo_root = _repo_root(Path.cwd())
    current_findings = _scan_tracked_files(repo_root)
    history_findings = _scan_history(repo_root) if args.history else []

    _print_findings("Tracked files", current_findings)
    if args.history:
        _print_findings("History", history_findings)

    high_count = sum(1 for finding in current_findings + history_findings if finding.severity == "high")
    if high_count:
        print(f"High-confidence findings: {high_count}")
        return 1
    if current_findings or history_findings:
        print("Only medium-confidence findings were detected.")
    else:
        print("No suspicious values detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
