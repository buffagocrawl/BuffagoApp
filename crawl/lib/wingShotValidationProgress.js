const VALIDATION_PROGRESS_CAP = 92;
const TICK_MS = 250;
const COMPLETION_TICK_MS = 50;
const COMPLETION_DURATION_MS = 300;

function validationProgressAt(elapsedMs) {
  const seconds = Math.max(0, elapsedMs) / 1000;
  if (seconds <= 3) return 3 + (17 * seconds) / 3;
  if (seconds <= 7) return 20 + (25 * (seconds - 3)) / 4;
  if (seconds <= 11) return 45 + (25 * (seconds - 7)) / 4;
  if (seconds <= 15) return 70 + (18 * (seconds - 11)) / 4;

  // Continue to reassure the user without implying the validator has succeeded.
  return Math.min(VALIDATION_PROGRESS_CAP, 88 + 4 * (1 - Math.exp(-(seconds - 15) / 20)));
}

export function createWingShotValidationProgress({
  onProgress,
  now = () => Date.now(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let timer = null;
  let operation = 0;
  let progress = 0;
  let startedAt = 0;
  let completing = null;

  const publish = (next) => {
    progress = Math.max(progress, Math.min(100, next));
    onProgress?.(progress);
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearIntervalFn(timer);
      timer = null;
    }
  };

  const settleCompletion = (completed) => {
    if (!completing) return;
    const { resolve } = completing;
    completing = null;
    resolve(completed);
  };

  const stop = (operationToStop = operation) => {
    if (operationToStop !== operation) return false;
    clearTimer();
    settleCompletion(false);
    return true;
  };

  const start = () => {
    operation += 1;
    clearTimer();
    settleCompletion(false);
    progress = 0;
    startedAt = now();
    publish(3);
    timer = setIntervalFn(() => publish(validationProgressAt(now() - startedAt)), TICK_MS);
    return operation;
  };

  const complete = (operationToComplete = operation) => {
    if (operationToComplete !== operation) return Promise.resolve(false);
    clearTimer();
    if (progress >= 100) return Promise.resolve(true);

    const completionStartedAt = now();
    const completionStart = progress;
    return new Promise((resolve) => {
      completing = { resolve };
      timer = setIntervalFn(() => {
        if (operationToComplete !== operation) return;
        const elapsed = now() - completionStartedAt;
        publish(completionStart + ((100 - completionStart) * Math.min(1, elapsed / COMPLETION_DURATION_MS)));
        if (elapsed >= COMPLETION_DURATION_MS) {
          clearTimer();
          settleCompletion(true);
        }
      }, COMPLETION_TICK_MS);
    });
  };

  return {
    start,
    complete,
    stop,
    clearTimer,
    isCurrent: (candidate) => candidate === operation,
    getProgress: () => progress,
    hasTimer: () => timer !== null,
  };
}

export { VALIDATION_PROGRESS_CAP, validationProgressAt };
