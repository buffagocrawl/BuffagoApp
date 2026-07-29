"""Community Wing Shot curation and publishing.

This package is intentionally isolated from Jalapeno's retired synthetic-media
paths. It only accepts approved community submission records supplied by the
server-authoritative repository contract.
"""

from .generation import (
    BrandedContentGenerator,
    FfmpegCommandRunner,
    GenerationOutcome,
    WingShotsGenerationWorker,
)
from .models import (
    Candidate,
    CandidateScore,
    NightlyRunReceipt,
    Platform,
    PublishResult,
    SocialJob,
)
from .orchestrator import NightlyConfig, WingShotsNightlyOrchestrator

__all__ = [
    "Candidate",
    "CandidateScore",
    "BrandedContentGenerator",
    "FfmpegCommandRunner",
    "GenerationOutcome",
    "NightlyConfig",
    "NightlyRunReceipt",
    "Platform",
    "PublishResult",
    "SocialJob",
    "WingShotsNightlyOrchestrator",
    "WingShotsGenerationWorker",
]
