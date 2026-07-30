export const VALIDATION_PROGRESS_CAP: number;

export function validationProgressAt(elapsedMs: number): number;

export interface WingShotValidationProgressController {
  start(): number;
  complete(operation?: number): Promise<boolean>;
  stop(operation?: number): boolean;
  clearTimer(): void;
  isCurrent(operation: number): boolean;
  getProgress(): number;
  hasTimer(): boolean;
}

export function createWingShotValidationProgress(options?: {
  onProgress?: (progress: number) => void;
  now?: () => number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}): WingShotValidationProgressController;
