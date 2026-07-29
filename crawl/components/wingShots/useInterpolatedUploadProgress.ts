import { useCallback, useEffect, useRef, useState } from 'react';
import { reconcileDisplayedProgress } from '../../lib/wingShotProgress';

export type UploadProgressStage =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'finalizing'
  | 'succeeded'
  | 'failed'
  | 'canceled';

const TICK_MS = 500;
const STEP = 5;

function clamp(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function stageCap(stage: UploadProgressStage) {
  return stage === 'finalizing' ? 95 : stage === 'uploading' || stage === 'preparing' ? 90 : 100;
}

export function useInterpolatedUploadProgress() {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [stage, setStageState] = useState<UploadProgressStage>('idle');
  const displayRef = useRef(0);
  const realRef = useRef(0);
  const stageRef = useRef<UploadProgressStage>('idle');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const operationRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const publish = useCallback((next: number) => {
    const value = reconcileDisplayedProgress({
      displayed: displayRef.current,
      real: next,
      stage: stageRef.current,
    });
    displayRef.current = value;
    if (mountedRef.current) setDisplayProgress(value);
  }, []);

  const tick = useCallback(() => {
    if (!mountedRef.current) return;
    const stageCapValue = stageCap(stageRef.current);
    if (displayRef.current >= stageCapValue) return;
    publish(Math.min(stageCapValue, Math.max(realRef.current, displayRef.current + STEP)));
  }, [publish]);

  const setStage = useCallback((next: UploadProgressStage) => {
    stageRef.current = next;
    if (mountedRef.current) setStageState(next);
    if (next === 'succeeded' || next === 'failed' || next === 'canceled' || next === 'idle') {
      clearTimer();
    }
  }, [clearTimer]);

  const start = useCallback(() => {
    clearTimer();
    operationRef.current += 1;
    realRef.current = 0;
    displayRef.current = 0;
    if (mountedRef.current) setDisplayProgress(0);
    setStage('preparing');
    publish(5);
    timerRef.current = setInterval(tick, TICK_MS);
    return operationRef.current;
  }, [clearTimer, publish, setStage, tick]);

  const updateRealProgress = useCallback((value: number) => {
    if (stageRef.current === 'succeeded' || stageRef.current === 'failed' || stageRef.current === 'canceled') return;
    realRef.current = Math.max(realRef.current, clamp(value));
    publish(Math.min(stageCap(stageRef.current), realRef.current));
  }, [publish]);

  const complete = useCallback(() => {
    setStage('succeeded');
    realRef.current = 100;
    publish(100);
  }, [publish, setStage]);

  const stop = useCallback((next: Extract<UploadProgressStage, 'failed' | 'canceled'>) => {
    operationRef.current += 1;
    setStage(next);
  }, [setStage]);

  const isCurrent = useCallback((operation: number) => operationRef.current === operation, []);

  useEffect(() => () => {
    mountedRef.current = false;
    clearTimer();
    operationRef.current += 1;
  }, [clearTimer]);

  return {
    displayProgress,
    stage,
    start,
    setStage,
    updateRealProgress,
    complete,
    stop,
    isCurrent,
    clearTimer,
    operationRef,
  };
}
