"""Typed failures used to drive retry and moderation behavior."""


class MediaProcessingError(RuntimeError):
    """Base class for all expected media-processing failures."""


class PermanentMediaError(MediaProcessingError):
    """The input is invalid or unsafe and retrying it cannot help."""


class RetryableMediaError(MediaProcessingError):
    """An infrastructure or transient process failure may succeed later."""
