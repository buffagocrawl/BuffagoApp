"""Failures classified for bounded database retry behavior."""


class WorkerError(RuntimeError):
    code = "WORKER_ERROR"
    retryable = False
    public_reason = "Wing Shot processing could not be completed."


class DuplicateMediaError(WorkerError):
    code = "DUPLICATE_MEDIA"
    public_reason = "This video was already submitted in another Wing Shot."


class RetryableWorkerError(WorkerError):
    code = "TRANSIENT_DEPENDENCY_FAILURE"
    retryable = True
    public_reason = "A temporary processing dependency was unavailable."


class WorkerContractError(WorkerError):
    code = "WORKER_CONTRACT_ERROR"
    public_reason = "The processing job did not satisfy its server contract."


class ProviderConfigurationError(WorkerError):
    code = "MODERATION_PROVIDER_UNCONFIGURED"
    public_reason = "The live moderation provider is not configured."


class ProviderContractError(WorkerError):
    code = "MODERATION_PROVIDER_INVALID_RESPONSE"
    public_reason = "The moderation provider returned an invalid result."


class ProviderRejectedRequest(WorkerError):
    code = "MODERATION_PROVIDER_REJECTED_REQUEST"
    public_reason = "The moderation provider rejected the request."


class ProviderTemporaryError(RetryableWorkerError):
    code = "MODERATION_PROVIDER_TEMPORARY_FAILURE"
    public_reason = "The moderation provider is temporarily unavailable."
