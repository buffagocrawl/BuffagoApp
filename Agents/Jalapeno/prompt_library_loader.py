from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Final


BASE_DIR: Final[Path] = Path(__file__).resolve().parents[2]
PROMPT_LIBRARY_DIR: Final[Path] = BASE_DIR / "prompt_library"
PROMPT_LIBRARY_VERSION: Final[str] = "prompt-library-v1"

# Future agents should load these markdown files instead of embedding prompt text in code.
PROMPT_LIBRARY_FILES: Final[dict[str, str]] = {
    "brand": "brand.md",
    "voice": "voice.md",
    "content_rules": "content_rules.md",
    "banned_phrases": "banned_phrases.md",
    "required_ctas": "required_ctas.md",
    "buffago_post": "prompts/buffago_post.md",
    "meme": "prompts/meme.md",
    "image_generation": "prompts/image_generation.md",
    "caption_cleanup": "prompts/caption_cleanup.md",
    "quality_review": "prompts/quality_review.md",
}


class PromptLibraryError(FileNotFoundError):
    pass


def _prompt_path(relative_path: str) -> Path:
    return PROMPT_LIBRARY_DIR / relative_path


@lru_cache(maxsize=1)
def load_prompt_text(key: str) -> str:
    relative_path = PROMPT_LIBRARY_FILES[key]
    path = _prompt_path(relative_path)
    if not path.exists():
        raise PromptLibraryError(f"Missing prompt file: {path}")
    return path.read_text(encoding="utf-8").strip()


@lru_cache(maxsize=1)
def load_prompt_library() -> dict[str, str]:
    return {key: load_prompt_text(key) for key in PROMPT_LIBRARY_FILES}


def validate_prompt_library() -> list[Path]:
    missing = [_prompt_path(relative_path) for relative_path in PROMPT_LIBRARY_FILES.values() if not _prompt_path(relative_path).exists()]
    if missing:
        joined = ", ".join(str(path) for path in missing)
        raise PromptLibraryError(f"Missing prompt library files: {joined}")
    return []


def prompt_library_manifest() -> dict[str, Any]:
    files = {key: str(_prompt_path(relative_path)) for key, relative_path in PROMPT_LIBRARY_FILES.items()}
    return {
        "version": PROMPT_LIBRARY_VERSION,
        "directory": str(PROMPT_LIBRARY_DIR),
        "files": files,
    }
