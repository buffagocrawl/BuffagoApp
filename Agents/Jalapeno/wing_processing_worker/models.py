"""Claim-bound worker data with no user identity or caption fields."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID


class JobKind(StrEnum):
    PHOTO = "photo_process"
    VIDEO = "video_process"


@dataclass(frozen=True, slots=True)
class ProcessingClaim:
    job_id: UUID
    submission_id: UUID
    job_kind: JobKind
    claim_token: UUID

    @classmethod
    def from_payload(cls, payload: object) -> "ProcessingClaim":
        if not isinstance(payload, dict):
            raise ValueError("claim payload must be an object")
        return cls(
            job_id=UUID(str(payload["job_id"])),
            submission_id=UUID(str(payload["submission_id"])),
            job_kind=JobKind(str(payload["job_kind"])),
            claim_token=UUID(str(payload["claim_token"])),
        )


@dataclass(frozen=True, slots=True)
class ProcessingContext:
    submission_id: UUID
    media_type: str
    bucket: str
    original_path: str
    processed_path: str
    thumbnail_path: str
    correlation_id: UUID

    @classmethod
    def from_payload(cls, payload: object) -> "ProcessingContext":
        if not isinstance(payload, dict):
            raise ValueError("processing context must be an object")
        context = cls(
            submission_id=UUID(str(payload["submission_id"])),
            media_type=str(payload["media_type"]),
            bucket=str(payload["bucket"]),
            original_path=str(payload["original_path"]),
            processed_path=str(payload["processed_path"]),
            thumbnail_path=str(payload["thumbnail_path"]),
            correlation_id=UUID(str(payload["correlation_id"])),
        )
        context.validate()
        return context

    def validate(self) -> None:
        submission = str(self.submission_id)
        if self.media_type not in {"photo", "video"}:
            raise ValueError("unsupported media type")
        if self.bucket != "wing-submissions":
            raise ValueError("unexpected storage bucket")
        parts = self.original_path.split("/")
        if (
            len(parts) != 4
            or parts[0] != "originals"
            or parts[2] != submission
            or parts[3] != "source"
            or ".." in parts
        ):
            raise ValueError("untrusted original path")
        UUID(parts[1])
        if self.processed_path != f"processed/{submission}/primary":
            raise ValueError("untrusted processed path")
        if self.thumbnail_path != f"thumbnails/{submission}/preview":
            raise ValueError("untrusted thumbnail path")


@dataclass(frozen=True, slots=True)
class FingerprintCandidate:
    submission_id: UUID
    fingerprint: str


@dataclass(frozen=True, slots=True)
class CleanupClaim:
    job_id: UUID
    cleanup_kind: str
    bucket: str
    object_path: str
    claim_token: UUID
    correlation_id: UUID

    @classmethod
    def from_payload(cls, payload: object) -> "CleanupClaim":
        if not isinstance(payload, dict):
            raise ValueError("cleanup claim must be an object")
        claim = cls(
            job_id=UUID(str(payload["job_id"])),
            cleanup_kind=str(payload["cleanup_kind"]),
            bucket=str(payload["bucket"]),
            object_path=str(payload["object_path"]),
            claim_token=UUID(str(payload["claim_token"])),
            correlation_id=UUID(str(payload["correlation_id"])),
        )
        parts = claim.object_path.split("/")
        if (
            claim.cleanup_kind not in {"expired_original", "abandoned_upload"}
            or claim.bucket != "wing-submissions"
            or len(parts) != 4
            or parts[0] != "originals"
            or parts[3] != "source"
            or ".." in parts
        ):
            raise ValueError("untrusted cleanup target")
        UUID(parts[1])
        UUID(parts[2])
        return claim
