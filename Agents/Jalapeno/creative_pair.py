from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Any


class CTAType(StrEnum):
    COMMENT = "comment"
    SEND = "send"
    TAG = "tag"
    SAVE = "save"
    FOLLOW = "follow"
    VISIT = "visit"
    VOTE = "vote"
    QUESTION = "question"
    NEUTRAL = "neutral"


class FailureClassification(StrEnum):
    CREATIVE_REPAIRABLE = "creative_repairable"
    CREATIVE_UNREPAIRABLE = "creative_unrepairable"
    CONFIGURATION = "configuration"
    AUTHORIZATION = "authorization"
    EXTERNAL_API = "external_api"
    STORAGE = "storage"
    DATABASE = "database"


@dataclass(frozen=True, slots=True)
class CreativePairValidationResult:
    passed: bool
    caption_cta_type: CTAType
    overlay_cta_type: CTAType
    errors: tuple[str, ...]
    caption_validation: dict[str, Any]
    overlay_validation: dict[str, Any] | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.passed,
            "passed": self.passed,
            "issues": list(self.errors),
            "reasons": list(self.errors),
            "errors": list(self.errors),
            "caption_cta_type": self.caption_cta_type.value,
            "overlay_cta_type": self.overlay_cta_type.value,
            "caption_validation": self.caption_validation,
            "overlay_validation": self.overlay_validation,
            "caption_angles": [self.caption_cta_type.value],
            "overlay_angles": [self.overlay_cta_type.value] if self.overlay_validation else [],
            "caption_overlay_concept": self.caption_cta_type.value,
            "overlay_reinforces_caption": self.passed,
        }


@dataclass(frozen=True, slots=True)
class CreativePair:
    caption_text: str
    overlay_text: str
    cta_type: CTAType
    content_angle: str
    caption_source: str
    overlay_source: str
    repair_applied: bool = False
    validation_status: str = "pending"
    validation_errors: tuple[str, ...] = ()
    overlay_cta_type: CTAType = CTAType.NEUTRAL
    repair_count: int = 0
    failure_classification: FailureClassification | None = None

    @property
    def caption_hash(self) -> str:
        return _text_hash(self.caption_text)

    @property
    def overlay_hash(self) -> str:
        return _text_hash(self.overlay_text)


def normalize_pair_text(text: str) -> str:
    return re.sub(r"[ \t]+", " ", str(text or "").replace("\r\n", "\n").replace("\r", "\n")).strip()


def _text_hash(text: str) -> str:
    return hashlib.sha256(normalize_pair_text(text).encode("utf-8")).hexdigest()[:16]


def classify_cta(text: str) -> CTAType:
    value = re.sub(r"#\w+", "", normalize_pair_text(text)).lower()
    ordered_patterns = (
        (CTAType.SEND, r"\b(send|share|group chat|dm this|forward)\b"),
        (CTAType.TAG, r"\btag\b"),
        (CTAType.SAVE, r"\bsave\b"),
        (CTAType.FOLLOW, r"\bfollow\b"),
        (CTAType.VISIT, r"\b(visit|download|open the app|link in bio)\b"),
        (CTAType.COMMENT, r"\b(comment|comments|reply|drop .* below|tell us)\b"),
        (CTAType.VOTE, r"\b(vote|pick a side)\b"),
    )
    for cta_type, pattern in ordered_patterns:
        if re.search(pattern, value):
            return cta_type
    if "?" in value:
        return CTAType.QUESTION
    return CTAType.NEUTRAL


def _question_subject(text: str) -> set[str]:
    body = re.sub(r"#\w+", "", normalize_pair_text(text)).lower()
    body = re.sub(r"\b(comment|comments|reply|vote|below|tell us|who|what|which|gets|the|a|an|your)\b", " ", body)
    return {token for token in re.findall(r"[a-z0-9']+", body) if len(token) > 2}


def _cta_compatible(caption_type: CTAType, overlay_type: CTAType, caption: str, overlay: str) -> bool:
    if caption_type == overlay_type:
        return True
    if {caption_type, overlay_type} <= {CTAType.COMMENT, CTAType.QUESTION}:
        caption_subject = _question_subject(caption)
        overlay_subject = _question_subject(overlay)
        return bool(caption_subject & overlay_subject)
    if overlay_type == CTAType.NEUTRAL and caption_type != CTAType.NEUTRAL:
        return bool(_question_subject(caption) & _question_subject(overlay))
    return caption_type == CTAType.NEUTRAL and overlay_type == CTAType.NEUTRAL


def validate_creative_pair(caption_text: str, overlay_text: str | None) -> CreativePairValidationResult:
    # Local import avoids making the legacy caption-rules module the owner of pair compatibility.
    from caption_rules import validate_caption, validate_overlay_text

    caption = normalize_pair_text(caption_text)
    overlay = normalize_pair_text(overlay_text or "")
    caption_validation = validate_caption(caption, require_hashtags=bool(re.search(r"#\w+", caption)))
    overlay_validation = validate_overlay_text(overlay) if overlay else None
    caption_type = classify_cta(caption)
    overlay_type = classify_cta(overlay)
    errors: list[str] = []
    if not caption_validation["passed"]:
        errors.extend(f"caption:{issue}" for issue in caption_validation["issues"])
    if overlay_validation is not None and not overlay_validation["passed"]:
        permitted_question_issues = {"overlay_not_direct_enough", "overlay_missing_share_trigger"}
        overlay_issues = set(overlay_validation["issues"])
        question_pair = {caption_type, overlay_type} <= {CTAType.COMMENT, CTAType.QUESTION}
        if not (question_pair and overlay_issues.issubset(permitted_question_issues)):
            errors.extend(f"overlay:{issue}" for issue in overlay_validation["issues"])
    if overlay and not _cta_compatible(caption_type, overlay_type, caption, overlay):
        errors.append("caption_overlay_mismatch")
    return CreativePairValidationResult(
        passed=not errors,
        caption_cta_type=caption_type,
        overlay_cta_type=overlay_type,
        errors=tuple(dict.fromkeys(errors)),
        caption_validation=caption_validation,
        overlay_validation=overlay_validation,
    )


def deterministic_overlay(caption_text: str, cta_type: CTAType | None = None) -> str:
    caption = re.sub(r"#\w+", "", normalize_pair_text(caption_text)).strip()
    resolved = cta_type or classify_cta(caption)
    question = next((part.strip() + "?" for part in caption.split("?")[:-1] if part.strip()), "")
    if resolved == CTAType.COMMENT and question:
        return f"COMMENT:\n{question.upper()}"
    if resolved == CTAType.QUESTION and question:
        words = question.upper().split()
        midpoint = max(1, min(len(words) - 1, (len(words) + 1) // 2))
        return " ".join(words[:midpoint]) + "\n" + " ".join(words[midpoint:])
    if resolved == CTAType.SEND:
        return "SEND THIS TO\nYOUR WING CREW"
    if resolved == CTAType.TAG:
        subject = re.sub(r"^.*?\btag\b", "TAG", caption, flags=re.IGNORECASE).rstrip(".!?").upper()
        words = subject.split()
        midpoint = max(1, min(len(words) - 1, 3))
        return " ".join(words[:midpoint]) + "\n" + " ".join(words[midpoint:])
    if resolved == CTAType.VOTE:
        prompt = question.upper() if question else "PICK YOUR SIDE"
        return f"{prompt}\nVOTE BELOW"
    templates = {
        CTAType.SAVE: "SAVE THIS FOR\nWING NIGHT",
        CTAType.FOLLOW: "FOLLOW FOR MORE\nWING FINDS",
        CTAType.VISIT: "FIND YOUR NEXT\nWING STOP",
        CTAType.NEUTRAL: "WHO GETS THE\nLAST WING?",
    }
    return templates[resolved]


def create_creative_pair(
    *, caption_text: str, overlay_text: str, caption_source: str, overlay_source: str,
    content_angle: str | None = None, repair_applied: bool = False,
) -> CreativePair:
    caption_type = classify_cta(caption_text)
    result = validate_creative_pair(caption_text, overlay_text)
    return CreativePair(
        caption_text=normalize_pair_text(caption_text), overlay_text=normalize_pair_text(overlay_text),
        cta_type=caption_type, content_angle=content_angle or caption_type.value,
        caption_source=caption_source, overlay_source=overlay_source, repair_applied=repair_applied,
        validation_status="passed" if result.passed else "failed", validation_errors=result.errors,
        overlay_cta_type=result.overlay_cta_type,
        failure_classification=(None if result.passed else FailureClassification.CREATIVE_REPAIRABLE
                                if result.errors == ("caption_overlay_mismatch",) else FailureClassification.CREATIVE_UNREPAIRABLE),
    )


def repair_creative_pair(pair: CreativePair) -> CreativePair:
    if pair.repair_count >= 1:
        return pair
    overlay = deterministic_overlay(pair.caption_text, pair.cta_type)
    result = validate_creative_pair(pair.caption_text, overlay)
    return replace(
        pair, overlay_text=overlay, overlay_source="deterministic_repair", repair_applied=True,
        repair_count=1, validation_status="passed" if result.passed else "failed",
        validation_errors=result.errors, overlay_cta_type=result.overlay_cta_type,
        failure_classification=None if result.passed else FailureClassification.CREATIVE_UNREPAIRABLE,
    )
