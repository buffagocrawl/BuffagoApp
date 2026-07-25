"""Bounded, secret-safe state classification for Cayenne Android auth runs."""
from __future__ import annotations

import re
from dataclasses import dataclass

OVERLAYS = {
    "EXPO_DEVELOPER_MENU": ("This is the developer menu", "Runtime version:"),
    "EXPO_BUNDLING": ("Bundling", "Loading JavaScript bundle"),
    "EXPO_CONNECTION_ERROR": ("Unable to connect", "Connection error"),
    "EXPO_RELOAD": ("Reloading", "Refreshing"),
    "EXPO_REDBOX": ("Error", "Unhandled JS Exception"),
    "NATIVE_PERMISSION_DIALOG": ("While using the app", "Only this time", "Allow"),
    "NATIVE_SYSTEM_DIALOG": ("Not now", "No thanks"),
}


def classify_overlay(hierarchy: str) -> str | None:
    for category, markers in OVERLAYS.items():
        if any(marker.lower() in (hierarchy or "").lower() for marker in markers):
            return category
    return None


def classify_auth_screen(hierarchy: str) -> dict:
    present = set(re.findall(r'resource-id="([^"]+)"', hierarchy or ""))
    required = {"auth.screen", "auth.email.input", "auth.password.input", "auth.signin.button"}
    missing = sorted(required - present)
    return {
        "state": "AUTH_SCREEN_READY" if not missing else "AUTH_SCREEN_INCOMPLETE",
        "requiredSelectors": sorted(required),
        "missingSelectors": missing,
        "overlay": classify_overlay(hierarchy),
        "keyboardVisible": "InputMethod" in (hierarchy or "") or "keyboard" in (hierarchy or "").lower(),
    }


def classify_terminal(hierarchy: str, logs: str = "") -> str:
    text = (hierarchy or "") + "\n" + (logs or "")
    ids = set(re.findall(r'resource-id="([^"]+)"', hierarchy or ""))
    lower = text.lower()
    if "auth.signed-in-marker" in ids or any(item in ids for item in ("nav.home", "nav.crawl", "nav.profile")):
        return "AUTHENTICATED_APP_SHELL"
    if "onboarding.root" in ids:
        return "AUTHENTICATED_ONBOARDING"
    if "invalid login credentials" in lower:
        return "INVALID_CREDENTIALS"
    if "network request failed" in lower or "failed to fetch" in lower:
        return "NETWORK_ERROR"
    if "auth.error" in ids:
        return "UNKNOWN_AUTH_FAILURE"
    return "AUTH_TIMEOUT"


def stage(name: str, status: str, **details) -> dict:
    return {"stage": name, "status": status, **details}
