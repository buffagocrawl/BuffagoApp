import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useNetworkState } from 'expo-network';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../lib/analytics';
import {
  createWingShotUploadSession,
  submitWingShot,
  validateWingShotMediaRemotely,
  validateWingShotMedia,
  wingShotUserMessage,
  wingShotProcessingCopy,
} from '../../lib/wingShots';
import { WingShotMediaPreview } from './WingShotMediaPreview';
import {
  expoWingShotMediaAdapter,
  WingShotMediaAdapterError,
  type WingShotMediaAdapter,
  type WingShotSelectedMedia,
} from './mediaAdapter';
import { useInterpolatedUploadProgress } from './useInterpolatedUploadProgress';
import { errorContext, mediaLogContext, safeErrorContext, wingShotLog } from '../../lib/wingShotDiagnostics';
import { stageWingShotMedia, cleanupWingShotStaging } from '../../lib/wingShotStaging';
import { createWingShotValidationProgress } from '../../lib/wingShotValidationProgress';

type Attribution = 'username' | 'display_name' | 'anonymous';
type Phase =
  | 'empty'
  | 'choosing'
  | 'validating'
  | 'valid'
  | 'submitting'
  | 'submitted'
  | 'cancelling'
  | 'error'
  | 'cancelled';

type Props = {
  visible: boolean;
  eligibleRatingId?: string | null;
  destinationId: string;
  submissionSource: 'rating' | 'onboarding' | 'buffacoin' | 'profile' | 'home_cta';
  draftMode?: boolean;
  draftResetSignal?: number;
  onDraftContinue?: (draft: {
    media: WingShotSelectedMedia;
    session: ReturnType<typeof createWingShotUploadSession>;
    consentAccepted: boolean;
    attributionPreference: Attribution;
    caption: string;
  }) => void;
  onClose: () => void;
  onSubmitted?: (result: { submission_id: string; status: string }) => void;
  mediaAdapter?: WingShotMediaAdapter;
  supabaseClient?: typeof supabase;
  isOnline?: boolean;
  allowPhoto?: boolean;
  uploadTransport?: (request: {
    client: typeof supabase;
    bucket: string;
    path: string;
    body: unknown;
    mimeType: string;
    signal?: AbortSignal;
    onProgress?: (value: number) => void;
  }) => Promise<{ error: unknown }>;
  validationTransport?: (request: {
    client: typeof supabase;
    media: WingShotSelectedMedia;
    body?: unknown;
    signal?: AbortSignal;
  }) => Promise<{ data?: { valid?: boolean; reason_code?: string; retryable?: boolean; retry_after_seconds?: number }; error?: unknown }>;
  analyticsContext?: {
    screen: string;
    userId?: string | null;
    destinationId?: string | null;
    crawlId?: string | null;
  };
};

const ATTRIBUTION_OPTIONS: {
  value: Attribution;
  title: string;
  detail: string;
}[] = [
  { value: 'username', title: 'Display username', detail: 'Credit my BuffaGo username.' },
  {
    value: 'display_name',
    title: 'Display name',
    detail: 'Credit my approved profile display name.',
  },
  { value: 'anonymous', title: 'Anonymous', detail: 'Show “BuffaGo community member.”' },
];

export function WingShotFlow({
  visible,
  eligibleRatingId,
  destinationId,
  submissionSource,
  draftMode = false,
  draftResetSignal = 0,
  onDraftContinue,
  onClose,
  onSubmitted,
  mediaAdapter = expoWingShotMediaAdapter,
  supabaseClient = supabase,
  isOnline,
  allowPhoto = true,
  uploadTransport,
  validationTransport,
  analyticsContext,
}: Props) {
  const [media, setMedia] = useState<WingShotSelectedMedia | null>(null);
  const [phase, setPhase] = useState<Phase>('empty');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  const [caption, setCaption] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [rateLimitRemainingSeconds, setRateLimitRemainingSeconds] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ submission_id: string; status: string } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const networkState = useNetworkState();
  const abortRef = useRef<AbortController | null>(null);
  const validationAbortRef = useRef<AbortController | null>(null);
  const validationSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const phaseRef = useRef<Phase>('empty');
  const sessionRef = useRef(createWingShotUploadSession(Crypto.randomUUID));
  const progressBarRef = useRef(new Animated.Value(0));
  const progressController = useInterpolatedUploadProgress();
  const [validationProgress, setValidationProgress] = useState(0);
  const previousDraftResetSignalRef = useRef(draftResetSignal);
  const validationProgressControllerRef = useRef<ReturnType<typeof createWingShotValidationProgress> | null>(null);
  if (!validationProgressControllerRef.current) {
    validationProgressControllerRef.current = createWingShotValidationProgress({ onProgress: setValidationProgress });
  }
  const skipNavigationRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const disabled = phase === 'choosing' || phase === 'validating' || phase === 'submitting' || phase === 'cancelling';
  const networkAvailable =
    isOnline ??
    (networkState.isConnected !== false && networkState.isInternetReachable !== false);

  const resetUploadSession = useCallback(() => {
    validationProgressControllerRef.current?.stop();
    setValidationProgress(0);
    progressController.clearTimer();
    sessionRef.current = createWingShotUploadSession(Crypto.randomUUID);
    progressController.stop('canceled');
    progressBarRef.current.setValue(0);
  }, [progressController]);

  const resetWingShotForm = useCallback((reason = 'explicit_reset') => {
    // An in-flight upload owns the draft until it settles. The successful
    // server record is never touched by this client-side reset.
    if (phaseRef.current === 'submitting' || phaseRef.current === 'cancelling') return false;
    wingShotLog(sessionRef.current.correlationId, 'Modal close and state cleanup', {
      reason,
      stateCleared: true,
    });
    if (sessionRef.current.staging) void cleanupWingShotStaging({ client: supabaseClient, staging: sessionRef.current.staging, correlationId: sessionRef.current.correlationId }).catch(() => undefined);
    setMedia(null);
    setConsentAccepted(false);
    setAttribution(null);
    setCaption('');
    setErrorMessage('');
    setErrorCode('');
    setUploadResult(null);
    setPhase('empty');
    resetUploadSession();
    return true;
  }, [resetUploadSession, supabaseClient]);

  const setPhaseSafely = useCallback((nextPhase: Phase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const handleCompletedFlowClose = useCallback(() => {
    if (phaseRef.current !== 'submitted') return;
    wingShotLog(sessionRef.current.correlationId, 'Modal close and state cleanup', {
      reason: 'successful_upload_closed',
      stateCleared: true,
    });
    resetWingShotForm();
    onClose();
  }, [onClose, resetWingShotForm]);

  const skipMediaUpload = useCallback(() => {
    if (
      skipNavigationRef.current ||
      phaseRef.current === 'submitting' ||
      phaseRef.current === 'cancelling'
    ) return;

    skipNavigationRef.current = true;
    wingShotLog(sessionRef.current.correlationId, 'Modal close and state cleanup', {
      reason: 'explicit_skip',
      stateCleared: true,
    });
    trackEvent({
      eventName: 'wing_shot_upload_skipped',
      screen: analyticsContext?.screen ?? submissionSource,
      userId: analyticsContext?.userId,
      destinationId: analyticsContext?.destinationId ?? destinationId,
      crawlId: analyticsContext?.crawlId ?? null,
      metadata: { media_selected: Boolean(media) },
    });
    resetWingShotForm();
    onClose();
  }, [analyticsContext, destinationId, media, onClose, resetWingShotForm, submissionSource]);

  const closeFlow = useCallback(() => {
    if (phaseRef.current === 'submitting' || phaseRef.current === 'cancelling') return;
    // An explicit close is the user's decision to abandon the optional upload.
    // A failed upload remains intact until this path or Skip media upload runs.
    resetWingShotForm('explicit_close');
    onClose();
  }, [onClose, resetWingShotForm]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (previousDraftResetSignalRef.current === draftResetSignal) return;
    previousDraftResetSignalRef.current = draftResetSignal;
    resetWingShotForm('rating_cancelled');
  }, [draftResetSignal, resetWingShotForm]);

  useEffect(() => () => {
    mountedRef.current = false;
    validationAbortRef.current?.abort();
    validationProgressControllerRef.current?.stop();
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!visible) return;
    wingShotLog(sessionRef.current.correlationId, 'Rating-to-Wing-Shot transition', {
      platform: Platform.OS,
      ratingIdPresent: Boolean(eligibleRatingId),
      destinationIdPresent: Boolean(destinationId),
      userIdPresent: Boolean(analyticsContext?.userId),
      submissionSource,
    });
  }, [analyticsContext?.userId, destinationId, eligibleRatingId, submissionSource, visible]);

  useEffect(() => {
    if (visible) skipNavigationRef.current = false;
  }, [visible]);

  useEffect(() => {
    if (rateLimitRemainingSeconds <= 0) return undefined;
    const timer = setInterval(() => setRateLimitRemainingSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [rateLimitRemainingSeconds]);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    Animated.timing(progressBarRef.current, {
      toValue: progressController.displayProgress,
      duration: reduceMotion ? 0 : 220,
      useNativeDriver: false,
    }).start();
  }, [progressController.displayProgress, reduceMotion]);

  const announce = useCallback((message: string) => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const lastAnnouncedStageRef = useRef(progressController.stage);
  useEffect(() => {
    if (lastAnnouncedStageRef.current === progressController.stage) return;
    lastAnnouncedStageRef.current = progressController.stage;
    if (progressController.stage === 'preparing') announce('Preparing your Wing Shot.');
    if (progressController.stage === 'authorizing') announce('Securing your Wing Shot upload.');
    if (progressController.stage === 'uploading') announce('Uploading your Wing Shot.');
    if (progressController.stage === 'server_validating') announce('Checking your Wing Shot.');
    if (progressController.stage === 'finalizing') announce('Finishing your submission.');
  }, [announce, progressController.stage]);

  const validateSelectedMedia = useCallback(async (selected: WingShotSelectedMedia) => {
    const sequence = ++validationSequenceRef.current;
    validationAbortRef.current?.abort();
    const validationOperation = validationProgressControllerRef.current?.start();
    const controller = new AbortController();
    validationAbortRef.current = controller;
    const requestState = { dispatched: false };
    const correlationId = sessionRef.current.correlationId;

    setPhaseSafely('validating');

    try {
      wingShotLog(correlationId, 'local_validation_started', {
        ...mediaLogContext(selected),
        reasonCode: null,
      });
      try {
        // This is deliberately separate from the remote validator. A local
        // metadata/state error must be visible and must never look like a
        // network failure.
        validateWingShotMedia(selected);
        wingShotLog(correlationId, 'local_validation_passed', {
          ...mediaLogContext(selected),
          reasonCode: 'local_validation_passed',
        });
      } catch (error) {
        const reasonCode = String((error as { code?: string })?.code || 'local_validation_error');
        wingShotLog(correlationId, 'local_validation_failed', {
          ...mediaLogContext(selected),
          reasonCode,
          error: safeErrorContext(error, typeof __DEV__ !== 'undefined' && __DEV__),
        }, 'warn');
        if ((error as { code?: string })?.code) throw error;
        const localError = new Error('local validation failed');
        (localError as { code?: string }).code = 'local_validation_error';
        (localError as { stage?: string }).stage = 'local_validation';
        throw localError;
      }

      if (controller.signal.aborted) {
        validationProgressControllerRef.current?.stop(validationOperation);
        wingShotLog(correlationId, 'validation_return', { reasonCode: 'validation_cancelled', stage: 'local_validation' });
        return;
      }
      if (!correlationId) {
        const error = new Error('missing validation correlation id');
        (error as { code?: string }).code = 'validation_state_error';
        throw error;
      }

      wingShotLog(correlationId, 'validation_started', {
        stage: 'staging_upload_server_validator',
        validator: 'wing-media-validate',
        project: 'vhfxnizaxdanmvmouuaf',
        reasonCode: 'local_validation_passed',
      });
      const staging = (sessionRef.current as any).staging ?? await stageWingShotMedia({
        client: supabaseClient,
        media: selected,
        correlationId,
        destinationId,
        signal: controller.signal,
        onProgress: (value) => progressController.updateRealProgress(value),
      });
      (sessionRef.current as any).staging = staging;
      requestState.dispatched = true;
      await validateWingShotMediaRemotely({
        client: supabaseClient,
        media: selected,
        signal: controller.signal,
        validationTransport,
        staging,
      });
      if (!mountedRef.current) {
        validationProgressControllerRef.current?.stop(validationOperation);
        wingShotLog(correlationId, 'validation_return', { reasonCode: 'component_unmounted', stage: 'server_validation' });
        return;
      }
      if (controller.signal.aborted) {
        validationProgressControllerRef.current?.stop(validationOperation);
        wingShotLog(correlationId, 'validation_return', { reasonCode: 'validation_cancelled', stage: 'server_validation' });
        return;
      }
      if (sequence !== validationSequenceRef.current) {
        validationProgressControllerRef.current?.stop(validationOperation);
        wingShotLog(correlationId, 'stale_validation_ignored', { stage: 'server_validation', reasonCode: 'stale_validation_cancelled' }, 'warn');
        wingShotLog(correlationId, 'validation_return', { reasonCode: 'stale_validation_sequence', stage: 'server_validation', sequence, currentSequence: validationSequenceRef.current });
        return;
      }
      wingShotLog(correlationId, 'validation_passed', { stage: 'server_validation', reasonCode: 'server_validation_passed' });
      const completed = await validationProgressControllerRef.current?.complete(validationOperation);
      if (!completed || !mountedRef.current || controller.signal.aborted || sequence !== validationSequenceRef.current) return;
      setPhaseSafely('valid');
      announce(draftMode ? 'Photo ready. Continue to your rating.' : 'Wing Shot ready.');
    } catch (error) {
      validationProgressControllerRef.current?.stop(validationOperation);
      const reasonCode = String((error as { code?: string })?.code || 'validation_unknown');
      const retryable = Boolean((error as { retryable?: boolean })?.retryable) || ['validator_unavailable', 'validation_timeout', 'validation_internal_failure', 'validation_network_failure', 'staging_upload_failed', 'upload_authorization_failed', 'rate_limited'].includes(reasonCode);
      wingShotLog(correlationId, retryable ? 'validation_retryable_failure' : 'validation_final_catch', {
        stage: (error as { stage?: string })?.stage || (requestState.dispatched ? 'server_validation' : 'local_validation'),
        error: safeErrorContext(error, typeof __DEV__ !== 'undefined' && __DEV__),
        reasonCode,
        requestDispatched: requestState.dispatched,
      }, retryable ? 'warn' : 'warn');
      if (!mountedRef.current) {
        wingShotLog(correlationId, 'validation_return', { reasonCode: 'component_unmounted', stage: 'final_catch' });
        return;
      }
      if (controller.signal.aborted || reasonCode === 'validation_cancelled') {
        wingShotLog(correlationId, 'validation_return', { reasonCode: 'validation_cancelled', stage: 'final_catch' });
        return;
      }
      if (sequence !== validationSequenceRef.current) {
        wingShotLog(correlationId, 'validation_return', { reasonCode: 'stale_validation_sequence', stage: 'final_catch', sequence, currentSequence: validationSequenceRef.current });
        return;
      }
      const message = wingShotUserMessage(error);
      if (!retryable && sessionRef.current.staging) void cleanupWingShotStaging({ client: supabaseClient, staging: sessionRef.current.staging, correlationId }).catch(() => undefined);
      if (!retryable) setMedia(null);
      setConsentAccepted(false);
      setErrorCode(reasonCode);
      setErrorMessage(message);
      setPhaseSafely(retryable ? 'error' : 'empty');
      announce(message);
    } finally {
      if (validationAbortRef.current === controller) validationAbortRef.current = null;
    }
  }, [announce, destinationId, draftMode, progressController, setPhaseSafely, supabaseClient, validationTransport]);

  useEffect(() => {
    if (!visible || draftMode || !media || phaseRef.current !== 'valid' || sessionRef.current.staging) return;
        void validateSelectedMedia(media);
  }, [draftMode, media, validateSelectedMedia, visible]);

  const retryValidation = useCallback(() => {
    if (!media || phaseRef.current !== 'error') return;
    void validateSelectedMedia(media);
  }, [media, validateSelectedMedia]);

  const acceptMedia = useCallback(
    (selected: WingShotSelectedMedia | null) => {
      if (!selected) {
        validationSequenceRef.current += 1;
        validationAbortRef.current?.abort();
        validationProgressControllerRef.current?.stop();
        setValidationProgress(0);
        wingShotLog(sessionRef.current.correlationId, 'validation_return', { reasonCode: 'selection_cancelled', stage: 'media_selection' });
        setPhaseSafely('empty');
        return;
      }
      if (
        selected.kind !== 'photo' || !allowPhoto
      ) {
        wingShotLog(sessionRef.current.correlationId, 'validation_return', { reasonCode: 'media_kind_disabled', stage: 'media_selection' }, 'warn');
        throw new WingShotMediaAdapterError(
          'media_kind_disabled',
          'That media type is not enabled for Wing Shots.',
        );
      }
      setMedia(selected);
      setConsentAccepted(false);
      setErrorMessage('');
      setErrorCode('');
      resetUploadSession();
      wingShotLog(sessionRef.current.correlationId, 'Photo selection', mediaLogContext(selected));
      wingShotLog(sessionRef.current.correlationId, 'validation_handoff_started', {
        ...mediaLogContext(selected),
        correlationId: sessionRef.current.correlationId,
        currentValidationState: phaseRef.current,
      });
      announce('Photo selected.');
      void validateSelectedMedia(selected);
    },
    [allowPhoto, announce, resetUploadSession, setPhaseSafely, validateSelectedMedia],
  );

  const chooseMedia = useCallback(
    async (source: 'photo' | 'library') => {
      trackEvent({
        eventName: 'wing_shot_capture_started',
        screen: analyticsContext?.screen ?? 'wing_shot',
        userId: analyticsContext?.userId,
        destinationId: analyticsContext?.destinationId ?? null,
        crawlId: analyticsContext?.crawlId ?? null,
        metadata: { source, requested_kind: source === 'library' ? 'user_choice' : source },
      });
      setPhaseSafely('choosing');
      setErrorMessage('');
      try {
        if (source === 'photo') {
          acceptMedia(await mediaAdapter.takePhoto());
        } else {
          acceptMedia(
            await mediaAdapter.chooseFromLibrary({
              allowedMediaKinds: ['photo'],
            }),
          );
        }
      } catch (error) {
        const message = wingShotUserMessage(error);
        setErrorCode(String((error as { code?: string })?.code || ''));
        wingShotLog(sessionRef.current.correlationId, 'Upload failed', {
          validationRule: (error as { code?: string })?.code ?? null,
          exception: errorContext(error),
        }, 'warn');
        setErrorMessage(message);
        if (mountedRef.current) setPhaseSafely('empty');
        announce(message);
      }
    },
    [acceptMedia, analyticsContext, announce, mediaAdapter, setPhaseSafely],
  );

  const removeMedia = useCallback(() => {
    if (sessionRef.current.staging) void cleanupWingShotStaging({ client: supabaseClient, staging: sessionRef.current.staging, correlationId: sessionRef.current.correlationId }).catch(() => undefined);
    setMedia(null);
    setConsentAccepted(false);
    setErrorMessage('');
    validationSequenceRef.current += 1;
    validationAbortRef.current?.abort();
    validationProgressControllerRef.current?.stop();
    setValidationProgress(0);
    setErrorCode('');
    setPhaseSafely('empty');
    resetUploadSession();
    announce('Selected media removed.');
  }, [announce, resetUploadSession, setPhaseSafely, supabaseClient]);

  const replaceMedia = useCallback(() => {
    if (sessionRef.current.staging) void cleanupWingShotStaging({ client: supabaseClient, staging: sessionRef.current.staging, correlationId: sessionRef.current.correlationId }).catch(() => undefined);
    setMedia(null);
    setConsentAccepted(false);
    setErrorMessage('');
    validationSequenceRef.current += 1;
    validationAbortRef.current?.abort();
    setErrorCode('');
    setPhaseSafely('empty');
    resetUploadSession();
    announce('Choose a replacement photo.');
  }, [announce, resetUploadSession, setPhaseSafely, supabaseClient]);

  const submit = useCallback(async () => {
    if (submitInFlightRef.current || phaseRef.current !== 'valid' || rateLimitRemainingSeconds > 0) return;
    if (!networkAvailable) {
      const message = wingShotUserMessage({ code: 'offline' });
      setErrorMessage(message);
      setPhaseSafely('error');
      announce(message);
      return;
    }
    if (!media) {
      const message = 'Choose a photo first.';
      setErrorMessage(message);
      announce(message);
      return;
    }
    if (media.kind === 'photo' && !allowPhoto) {
      const message = 'That media type is not enabled for Wing Shots.';
      setErrorMessage(message);
      setPhaseSafely('error');
      announce(message);
      return;
    }
    const controller = new AbortController();
    submitInFlightRef.current = true;
    abortRef.current = controller;
    setErrorMessage('');
    setPhaseSafely('submitting');
    const operation = progressController.start();
    trackEvent({
      eventName: 'wing_shot_upload_started',
      screen: analyticsContext?.screen ?? 'wing_shot',
      userId: analyticsContext?.userId,
      destinationId: analyticsContext?.destinationId ?? null,
      crawlId: analyticsContext?.crawlId ?? null,
      metadata: { media_type: media.kind },
    });
    try {
      const result = await submitWingShot({
        client: supabaseClient,
        input: {
          userId: analyticsContext?.userId,
          ratingId: eligibleRatingId,
          media,
          consentAccepted,
          attributionPreference: attribution,
          caption,
          destinationId,
          submissionSource,
        },
        session: sessionRef.current,
        signal: controller.signal,
        onProgress: (value) => {
          if (progressController.isCurrent(operation)) progressController.updateRealProgress(value);
        },
        onStage: (nextStage) => {
          if (progressController.isCurrent(operation)) progressController.setStage(nextStage);
        },
        ...(uploadTransport ? { uploadTransport } : {}),
      });
      if (!mountedRef.current || !progressController.isCurrent(operation) || controller.signal.aborted) return;
      progressController.complete();
      setUploadResult(result);
      setPhaseSafely('submitted');
      wingShotLog(sessionRef.current.correlationId, 'Final success or failure', {
        outcome: 'success',
        ...mediaLogContext(media),
      });
      trackEvent({
        eventName: 'wing_shot_upload_completed',
        screen: analyticsContext?.screen ?? 'wing_shot',
        userId: analyticsContext?.userId,
        destinationId: analyticsContext?.destinationId ?? null,
        crawlId: analyticsContext?.crawlId ?? null,
        metadata: { media_type: media.kind, status: 'submitted_for_review' },
      });
      announce('Wing Shot submitted for review.');
      onSubmitted?.(result);
    } catch (error) {
      if (!mountedRef.current || !progressController.isCurrent(operation)) return;
      progressController.stop(controller.signal.aborted ? 'canceled' : 'failed');
      const message = wingShotUserMessage(error);
      const caughtCode = String((error as { code?: string })?.code || '');
      const isRateLimited = caughtCode === 'WING_SHOT_RATE_LIMITED' || caughtCode === 'RATE_LIMITED' || caughtCode === 'rate_limited';
      if (isRateLimited) {
        setRateLimitRemainingSeconds(Math.max(0, Math.ceil(Number((error as { retryAfterSeconds?: number })?.retryAfterSeconds) || 0)));
      }
      wingShotLog(sessionRef.current.correlationId, 'Final success or failure', {
        outcome: 'failure',
        ...mediaLogContext(media),
        ratingIdPresent: Boolean(eligibleRatingId),
        destinationIdPresent: Boolean(destinationId),
        userIdPresent: Boolean(analyticsContext?.userId),
        ...(isRateLimited ? {} : { exception: errorContext(error) }),
        userFacingClassification: caughtCode || 'unknown',
        userFacingMessage: message,
      }, 'warn');
      setErrorCode(caughtCode);
      trackEvent({
        eventName: 'wing_shot_upload_failed',
        screen: analyticsContext?.screen ?? 'wing_shot',
        userId: analyticsContext?.userId,
        destinationId: analyticsContext?.destinationId ?? null,
        crawlId: analyticsContext?.crawlId ?? null,
        metadata: {
          media_type: media.kind,
          error_code: caughtCode || 'unknown',
          failure_stage: String((error as { stage?: string })?.stage || 'unknown'),
        },
      });
      setErrorMessage(message);
      setPhaseSafely(controller.signal.aborted ? 'cancelled' : 'valid');
      announce(message);
    } finally {
      submitInFlightRef.current = false;
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [
    announce,
    analyticsContext,
    allowPhoto,
    attribution,
    caption,
    consentAccepted,
    eligibleRatingId,
    destinationId,
    networkAvailable,
    media,
    onSubmitted,
    supabaseClient,
    submissionSource,
    uploadTransport,
    progressController,
    rateLimitRemainingSeconds,
    setPhaseSafely,
  ]);

  const selectedKindEnabled = media?.kind === 'photo' ? allowPhoto : false;
  const canSubmit = Boolean(
    phase === 'valid' && media && selectedKindEnabled && consentAccepted && attribution && !disabled && rateLimitRemainingSeconds <= 0,
  );
  const continueToRating = useCallback(() => {
    if (!draftMode || !canSubmit || !media || !attribution) return;
    onDraftContinue?.({
      media,
      session: sessionRef.current,
      consentAccepted,
      attributionPreference: attribution,
      caption,
    });
  }, [attribution, canSubmit, caption, consentAccepted, draftMode, media, onDraftContinue]);
  const safeProgress = Math.max(0, Math.min(100, progressController.displayProgress));
  const progressLabel = useMemo(
    () => {
      if (progressController.stage === 'preparing' || progressController.stage === 'authorizing') return 'Securing your Wing Shot upload…';
      if (progressController.stage === 'server_validating') return 'Checking your Wing Shot…';
      if (progressController.stage === 'finalizing') return 'Finishing your submission…';
      return `Uploading your Wing Shot — ${Math.round(safeProgress)}%`;
    },
    [progressController.stage, safeProgress],
  );
  const cancelUpload = useCallback(() => {
    abortRef.current?.abort();
    progressController.clearTimer();
    setPhaseSafely('cancelling');
    announce('Cancelling upload.');
  }, [announce, progressController, setPhaseSafely]);

  return (
    <Modal
      animationType="none"
      onRequestClose={disabled ? undefined : closeFlow}
      presentationStyle="fullScreen"
      visible={visible}
      testID="wing-shot.flow"
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not now, close Wing Shot"
              disabled={disabled}
              onPress={closeFlow}
              style={styles.closeButton}
              testID="wing-shot.not-now"
            >
              <Ionicons name="close" size={28} color="#1D2430" accessibilityElementsHidden />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            testID="wing-shot.scroll"
          >
            <View style={styles.contentGroup}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow} allowFontScaling>
                  OPTIONAL · YOUR RATING HAS ALREADY SAVED
                </Text>
                <Text style={styles.title} accessibilityRole="header" allowFontScaling>
                  {draftMode ? 'Add a photo' : 'Show us the wings'}
                </Text>
              </View>

            <Text style={styles.intro} allowFontScaling>
              Share a photo of wings from this restaurant. Every submission is reviewed;
              only approved photos may be featured on BuffaGo’s Instagram and Facebook. Approved
              creators earn XP, badges, and recognition.
            </Text>

            {!media ? (
              <View style={styles.section} testID="wing-shot.media-actions">
                {allowPhoto ? (
                  <ActionButton
                    icon="camera"
                    label="Take Photo"
                    testID="wing-shot.take-photo"
                    disabled={disabled}
                    onPress={() => chooseMedia('photo')}
                  />
                ) : null}
                {allowPhoto ? (
                  <ActionButton
                    icon="images"
                    label="Choose from Library"
                    testID="wing-shot.choose-library"
                    disabled={disabled}
                    onPress={() => chooseMedia('library')}
                  />
                ) : (
                  <View
                    accessibilityRole="text"
                    style={styles.unavailableCard}
                    testID="wing-shot.media-disabled"
                  >
                    <Text style={styles.unavailableText} allowFontScaling>
                      Wing Shot uploads are not available right now.
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <>
                <WingShotMediaPreview
                  media={media}
                  disabled={disabled}
                  onReplace={replaceMedia}
                  onRemove={removeMedia}
                />
              </>
            )}

            {media ? (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle} accessibilityRole="header" allowFontScaling>
                    How should we credit you?
                  </Text>
                  {ATTRIBUTION_OPTIONS.map((option) => {
                    const selected = attribution === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        onPress={() => setAttribution(option.value)}
                        style={[styles.choice, selected && styles.choiceSelected]}
                        testID={`wing-shot.attribution.${option.value}`}
                      >
                        <Ionicons
                          name={selected ? 'radio-button-on' : 'radio-button-off'}
                          size={24}
                          color={selected ? '#A83D18' : '#606773'}
                          accessibilityElementsHidden
                        />
                        <View style={styles.flex}>
                          <Text style={styles.choiceTitle} allowFontScaling>
                            {option.title}
                          </Text>
                          <Text style={styles.choiceDetail} allowFontScaling>
                            {option.detail}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle} accessibilityRole="header" allowFontScaling>
                    Add a caption (optional)
                  </Text>
                  <TextInput
                    accessibilityLabel="Wing Shot caption, optional"
                    maxLength={500}
                    multiline
                    onChangeText={setCaption}
                    placeholder="What made these wings worth the shot?"
                    placeholderTextColor="#747B85"
                    style={styles.caption}
                    testID="wing-shot.caption"
                    value={caption}
                  />
                  <Text style={styles.characterCount} allowFontScaling>
                    {caption.length}/500
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consentAccepted }}
                  onPress={() => {
                    setConsentAccepted((accepted) => {
                      const next = !accepted;
                      if (next) {
                        trackEvent({
                          eventName: 'wing_shot_consent_completed',
                          screen: analyticsContext?.screen ?? 'wing_shot',
                          userId: analyticsContext?.userId,
                          destinationId: analyticsContext?.destinationId ?? null,
                          crawlId: analyticsContext?.crawlId ?? null,
                          metadata: { consent_version: 'wing-shots-v1' },
                        });
                      }
                      return next;
                    });
                  }}
                  style={[styles.consent, consentAccepted && styles.consentSelected]}
                  testID="wing-shot.consent"
                >
                  <Ionicons
                    name={consentAccepted ? 'checkbox' : 'square-outline'}
                    size={26}
                    color={consentAccepted ? '#A83D18' : '#606773'}
                    accessibilityElementsHidden
                  />
                  <Text style={styles.consentText} allowFontScaling>
                    I created this media or have permission to share it. BuffaGo may store,
                    edit, crop, resize, brand, combine, publish, and promote it with the
                    restaurant, rating, and attribution I selected. I will not upload people
                    without permission, and I understand submission does not guarantee
                    publication.
                  </Text>
                </Pressable>
              </>
            ) : null}

            {errorMessage ? (
              <View
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
                style={styles.error}
                testID="wing-shot.error"
              >
                <Ionicons name="alert-circle" size={22} color="#9C2F16" />
                <View style={styles.flex}>
                  {errorCode ? <Text style={styles.errorTitle} allowFontScaling>{wingShotProcessingCopy({ code: errorCode, retryAfterSeconds: rateLimitRemainingSeconds }).title}</Text> : null}
                <Text style={styles.errorText} allowFontScaling>{errorMessage}</Text>
                  {phase === 'error' && media ? <Pressable accessibilityRole="button" onPress={retryValidation} style={styles.cancelButton} testID="wing-shot.validation-retry"><Text style={styles.cancelText}>Retry validation</Text></Pressable> : null}
                </View>
              </View>
            ) : null}

            {phase === 'validating' ? (
              <View
                accessible
                accessibilityLabel="Validating your Wing Shot…"
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(validationProgress) }}
                style={styles.progressCard}
                testID="wing-shot.validation-progress"
              >
                <Text style={styles.progressText} allowFontScaling>Validating your Wing Shot…</Text>
                <View style={styles.progressTrack}><View style={[styles.progressFill, styles.validationFill, { width: `${validationProgress}%` }]} /></View>
              </View>
            ) : null}

            {phase === 'submitting' || phase === 'cancelling' ? (
              <View
                accessible
                accessibilityLabel={progressLabel}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(safeProgress) }}
                style={styles.progressCard}
                testID="wing-shot.upload-progress"
              >
                <Text style={styles.progressText} allowFontScaling>
                  {progressLabel}
                </Text>
                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: progressBarRef.current.interpolate({
                          inputRange: [0, 100],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Stops this attempt before final approval when possible"
                  disabled={phase === 'cancelling'}
                  onPress={cancelUpload}
                  style={styles.cancelButton}
                  testID="wing-shot.upload-cancel"
                >
                  <Text style={styles.cancelText} allowFontScaling>
                    {phase === 'cancelling' ? 'Cancelling…' : 'Cancel upload'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {phase === 'valid' ? (
              <View accessibilityLiveRegion="polite" style={styles.success} testID="wing-shot.ready">
                <Ionicons name="checkmark-circle" size={24} color="#287A46" />
                <Text style={styles.successTitle} allowFontScaling>Wing Shot ready!</Text>
              </View>
            ) : null}

            {phase === 'submitted' ? (
              <View
                accessibilityLiveRegion="polite"
                style={styles.success}
                testID="wing-shot.success"
              >
                <Ionicons name="checkmark-circle" size={30} color="#287A46" />
                <View style={styles.flex}>
                  <Text style={styles.successTitle} allowFontScaling>
                    Wing Shot submitted
                  </Text>
                  <Text style={styles.successText} allowFontScaling>
                    {uploadResult?.status === 'in_review' ? 'Your submission is now under review.' : 'Your submission was saved.'} Approved photos may be featured, and approved
                    creators earn XP, badges, and recognition.
                  </Text>
                </View>
              </View>
            ) : null}

            {phase !== 'submitted' &&
            phase !== 'submitting' &&
            phase !== 'validating' &&
            phase !== 'cancelling' &&
            allowPhoto ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
                disabled={!canSubmit}
                onPress={draftMode ? continueToRating : submit}
                style={[styles.submitButton, !canSubmit && styles.disabledButton]}
                testID={
                  phase === 'error' || phase === 'cancelled'
                    ? 'wing-shot.upload-retry'
                    : draftMode ? 'wing-shot.continue-rating' : 'wing-shot.submit'
                }
              >
                <Text style={styles.submitText} allowFontScaling>
                  {draftMode ? 'Continue to rating' : rateLimitRemainingSeconds > 0 ? `Try again in ${formatCountdown(rateLimitRemainingSeconds)}` : 'Submit Wing Shot'}
                </Text>
              </Pressable>
            ) : null}

            {phase !== 'submitted' && phase !== 'submitting' && phase !== 'validating' && phase !== 'cancelling' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip photo upload and continue"
                accessibilityState={{ disabled: skipNavigationRef.current }}
                disabled={skipNavigationRef.current}
                onPress={skipMediaUpload}
                style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
                testID="wing-shot.skip-media"
              >
                <Text style={styles.skipText} allowFontScaling>
                  Skip for now — you can add a photo later from Rating History.
                </Text>
              </Pressable>
            ) : null}

            {phase === 'submitted' ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleCompletedFlowClose}
                style={styles.submitButton}
                testID="wing-shot.done"
              >
                <Text style={styles.submitText} allowFontScaling>
                  Done
                </Text>
              </Pressable>
            ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

type ActionButtonProps = {
  icon: 'camera' | 'images';
  label: string;
  detail?: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
};

function ActionButton({
  icon,
  label,
  detail,
  disabled,
  onPress,
  testID,
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
      testID={testID}
    >
      <Ionicons name={icon} size={26} color="#A83D18" accessibilityElementsHidden />
      <View style={styles.flex}>
        <Text style={styles.actionTitle} allowFontScaling>
          {label}
        </Text>
        {detail ? (
          <Text style={styles.actionDetail} allowFontScaling>
            {detail}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={22} color="#606773" accessibilityElementsHidden />
    </Pressable>
  );
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF9EF' },
  flex: { flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 1,
    paddingRight: 12,
    paddingTop: 8,
  },
  headerCopy: { flex: 1, paddingRight: 12 },
  eyebrow: {
    color: '#775A36',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  title: { color: '#1D2430', fontSize: 28, lineHeight: 35, fontWeight: '900' },
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 76,
    paddingBottom: 56,
  },
  contentGroup: { gap: 20 },
  intro: { color: '#343A45', fontSize: 17, lineHeight: 25 },
  section: { gap: 12 },
  sectionTitle: { color: '#1D2430', fontSize: 20, lineHeight: 27, fontWeight: '800' },
  actionButton: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#D9D1C5',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionTitle: { color: '#1D2430', fontSize: 17, lineHeight: 23, fontWeight: '800' },
  actionDetail: { color: '#5E6570', fontSize: 14, lineHeight: 20 },
  choice: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9D1C5',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  choiceSelected: { borderColor: '#A83D18', backgroundColor: '#FFF1E5' },
  choiceTitle: { color: '#1D2430', fontSize: 16, lineHeight: 22, fontWeight: '800' },
  choiceDetail: { color: '#5E6570', fontSize: 14, lineHeight: 20 },
  caption: {
    minHeight: 108,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B7AFA4',
    backgroundColor: '#FFFFFF',
    color: '#1D2430',
    fontSize: 16,
    lineHeight: 23,
    padding: 14,
    textAlignVertical: 'top',
  },
  characterCount: { color: '#606773', textAlign: 'right', fontSize: 13 },
  consent: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B7AFA4',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  consentSelected: { borderColor: '#A83D18' },
  consentText: { flex: 1, color: '#343A45', fontSize: 15, lineHeight: 22 },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    backgroundColor: '#FFF0EC',
    padding: 14,
  },
  errorText: { flex: 1, color: '#702411', fontSize: 15, lineHeight: 22 },
  errorTitle: { color: '#702411', fontWeight: '800', marginBottom: 3 },
  errorAction: { color: '#9C2F16', fontWeight: '800', marginTop: 8 },
  progressCard: { borderRadius: 14, backgroundColor: '#FFFFFF', padding: 16, gap: 12 },
  progressText: { color: '#1D2430', fontSize: 16, fontWeight: '700' },
  progressTrack: {
    height: 10,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: '#E5DFD6',
  },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: '#A83D18' },
  validationFill: { width: '50%', opacity: 0.7 },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#8A2F19', fontSize: 16, fontWeight: '800' },
  success: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    backgroundColor: '#EAF7EF',
    padding: 16,
  },
  successTitle: { color: '#174D2B', fontSize: 18, lineHeight: 24, fontWeight: '900' },
  successText: { color: '#285E3B', fontSize: 15, lineHeight: 22 },
  submitButton: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#A83D18',
    paddingHorizontal: 18,
  },
  skipButton: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A83D18',
    backgroundColor: '#FFF9EF',
    paddingHorizontal: 18,
  },
  skipText: { color: '#8A2F19', fontSize: 17, fontWeight: '800' },
  disabledButton: { backgroundColor: '#A8A39C' },
  submitText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  pressed: { opacity: 0.72 },
  unavailableCard: {
    borderRadius: 14,
    backgroundColor: '#F0EBE3',
    padding: 16,
  },
  unavailableText: { color: '#5E6570', fontSize: 16, lineHeight: 23 },
});
