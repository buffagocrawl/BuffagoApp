import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useNetworkState } from 'expo-network';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
  validateWingShotMedia,
  WING_SHOT_VIDEO_MAX_SECONDS,
  WING_SHOT_VIDEO_TARGET_SECONDS,
  wingShotUserMessage,
} from '../../lib/wingShots';
import { WingShotMediaPreview } from './WingShotMediaPreview';
import {
  expoWingShotMediaAdapter,
  WingShotMediaAdapterError,
  type WingShotMediaAdapter,
  type WingShotSelectedMedia,
} from './mediaAdapter';

type Attribution = 'username' | 'display_name' | 'anonymous';
type Phase =
  | 'editing'
  | 'choosing'
  | 'uploading'
  | 'cancelling'
  | 'error'
  | 'cancelled'
  | 'success';

type Props = {
  visible: boolean;
  eligibleRatingId?: string | null;
  destinationId: string;
  submissionSource: 'rating' | 'onboarding' | 'buffacoin' | 'profile' | 'home_cta';
  onClose: () => void;
  onSubmitted?: (result: { submission_id: string; status: string }) => void;
  mediaAdapter?: WingShotMediaAdapter;
  supabaseClient?: typeof supabase;
  isOnline?: boolean;
  allowPhoto?: boolean;
  allowVideo?: boolean;
  uploadTransport?: (request: {
    client: typeof supabase;
    bucket: string;
    path: string;
    body: unknown;
    mimeType: string;
  }) => Promise<{ error: unknown }>;
  analyticsContext?: {
    screen: string;
    userId?: string | null;
    destinationId?: string | null;
    crawlId?: string | null;
  };
};

// TODO: Remove debug logging after Wing Shot upload issue is resolved.
function logWingShotError(error: unknown) {
  console.error('[WingShot] Supabase/Upload error object:', error);
  if (error && typeof error === 'object') {
    const serverError = error as Record<string, unknown>;
    console.error('[WingShot] Supabase/Upload error details', {
      message: serverError.message,
      details: serverError.details,
      hint: serverError.hint,
      code: serverError.code,
      status: serverError.status,
      statusCode: serverError.statusCode,
    });
  }
}

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
  onClose,
  onSubmitted,
  mediaAdapter = expoWingShotMediaAdapter,
  supabaseClient = supabase,
  isOnline,
  allowPhoto = true,
  allowVideo = true,
  uploadTransport,
  analyticsContext,
}: Props) {
  const [media, setMedia] = useState<WingShotSelectedMedia | null>(null);
  const [phase, setPhase] = useState<Phase>('editing');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  const [caption, setCaption] = useState('');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const networkState = useNetworkState();
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(createWingShotUploadSession(Crypto.randomUUID));
  const disabled =
    phase === 'choosing' || phase === 'uploading' || phase === 'cancelling';
  const networkAvailable =
    isOnline ??
    (networkState.isConnected !== false && networkState.isInternetReachable !== false);

  const resetUploadSession = useCallback(() => {
    sessionRef.current = createWingShotUploadSession(Crypto.randomUUID);
    setProgress(0);
  }, []);

  const announce = useCallback((message: string) => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const acceptMedia = useCallback(
    (selected: WingShotSelectedMedia | null) => {
      if (!selected) {
        setPhase('editing');
        return;
      }
      if (
        (selected.kind === 'photo' && !allowPhoto) ||
        (selected.kind === 'video' && !allowVideo)
      ) {
        throw new WingShotMediaAdapterError(
          'media_kind_disabled',
          'That media type is not enabled for Wing Shots.',
        );
      }
      // TODO: Remove debug logging after Wing Shot upload issue is resolved.
      console.log('[WingShot] Media selected', {
        mediaType: selected.kind,
        mimeType: selected.mimeType,
        sizeBytes: selected.sizeBytes,
      });
      validateWingShotMedia(selected);
      setMedia(selected);
      setConsentAccepted(false);
      setErrorMessage('');
      setPhase('editing');
      resetUploadSession();
      announce(`${selected.kind === 'photo' ? 'Photo' : 'Video'} selected.`);
    },
    [allowPhoto, allowVideo, announce, resetUploadSession],
  );

  const chooseMedia = useCallback(
    async (source: 'photo' | 'video' | 'library') => {
      trackEvent({
        eventName: 'wing_shot_capture_started',
        screen: analyticsContext?.screen ?? 'wing_shot',
        userId: analyticsContext?.userId,
        destinationId: analyticsContext?.destinationId ?? null,
        crawlId: analyticsContext?.crawlId ?? null,
        metadata: { source, requested_kind: source === 'library' ? 'user_choice' : source },
      });
      setPhase('choosing');
      setErrorMessage('');
      try {
        if (source === 'photo') {
          acceptMedia(await mediaAdapter.takePhoto());
        } else if (source === 'video') {
          acceptMedia(
            await mediaAdapter.recordVideo({
              targetDurationSeconds: WING_SHOT_VIDEO_TARGET_SECONDS,
              maximumDurationSeconds: WING_SHOT_VIDEO_MAX_SECONDS,
            }),
          );
        } else {
          acceptMedia(
            await mediaAdapter.chooseFromLibrary({
              maximumVideoDurationSeconds: WING_SHOT_VIDEO_MAX_SECONDS,
              allowedMediaKinds: [
                ...(allowPhoto ? (['photo'] as const) : []),
                ...(allowVideo ? (['video'] as const) : []),
              ],
            }),
          );
        }
      } catch (error) {
        const message = wingShotUserMessage(error);
        setErrorMessage(message);
        setPhase('error');
        announce(message);
      }
    },
    [acceptMedia, allowPhoto, allowVideo, analyticsContext, announce, mediaAdapter],
  );

  const removeMedia = useCallback(() => {
    setMedia(null);
    setConsentAccepted(false);
    setErrorMessage('');
    setPhase('editing');
    resetUploadSession();
    announce('Selected media removed.');
  }, [announce, resetUploadSession]);

  const replaceMedia = useCallback(() => {
    setMedia(null);
    setConsentAccepted(false);
    setErrorMessage('');
    setPhase('editing');
    resetUploadSession();
    announce('Choose a replacement photo or video.');
  }, [announce, resetUploadSession]);

  const submit = useCallback(async () => {
    if (!networkAvailable) {
      const message = wingShotUserMessage({ code: 'offline' });
      setErrorMessage(message);
      setPhase('error');
      announce(message);
      return;
    }
    if (!media) {
      const message = 'Choose a photo or video first.';
      setErrorMessage(message);
      announce(message);
      return;
    }
    if (
      (media.kind === 'photo' && !allowPhoto) ||
      (media.kind === 'video' && !allowVideo)
    ) {
      const message = 'That media type is not enabled for Wing Shots.';
      setErrorMessage(message);
      setPhase('error');
      announce(message);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setErrorMessage('');
    setPhase('uploading');
    setProgress(0);
    // TODO: Remove debug logging after Wing Shot upload issue is resolved.
    console.log('[WingShot] Upload started');
    console.log('[WingShot] Upload input', {
      mediaType: media.kind,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      consentAccepted,
      attributionPreference: attribution,
    });
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
        onProgress: setProgress,
        ...(uploadTransport ? { uploadTransport } : {}),
      });
      // TODO: Remove debug logging after Wing Shot upload issue is resolved.
      console.log('[WingShot] Upload complete');
      setPhase('success');
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
      // TODO: Remove debug logging after Wing Shot upload issue is resolved.
      console.error('[WingShot] Upload failed');
      logWingShotError(error);
      if (error instanceof Error) {
        console.error('[WingShot] Error message:', error.message);
        console.error('[WingShot] Error stack:', error.stack);
      }
      const message = wingShotUserMessage(error);
      trackEvent({
        eventName: 'wing_shot_upload_failed',
        screen: analyticsContext?.screen ?? 'wing_shot',
        userId: analyticsContext?.userId,
        destinationId: analyticsContext?.destinationId ?? null,
        crawlId: analyticsContext?.crawlId ?? null,
        metadata: {
          media_type: media.kind,
          error_code: String((error as { code?: string })?.code || 'unknown'),
          failure_stage: String((error as { stage?: string })?.stage || 'unknown'),
        },
      });
      setErrorMessage(message);
      setPhase(controller.signal.aborted ? 'cancelled' : 'error');
      announce(message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [
    announce,
    analyticsContext,
    allowPhoto,
    allowVideo,
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
  ]);

  const selectedKindEnabled =
    media?.kind === 'photo' ? allowPhoto : media?.kind === 'video' ? allowVideo : false;
  const canSubmit = Boolean(
    media && selectedKindEnabled && consentAccepted && attribution && !disabled,
  );
  const safeProgress = Math.max(0, Math.min(100, progress));
  const progressLabel = useMemo(
    () => `Uploading ${Math.round(safeProgress)} percent`,
    [safeProgress],
  );
  const cancelUpload = useCallback(() => {
    abortRef.current?.abort();
    setPhase('cancelling');
    announce('Cancelling upload.');
  }, [announce]);

  return (
    <Modal
      animationType="none"
      onRequestClose={disabled ? undefined : onClose}
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
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow} allowFontScaling>
                OPTIONAL · YOUR RATING IS SAVED
              </Text>
              <Text style={styles.title} accessibilityRole="header" allowFontScaling>
                Show us the wings
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not now, close Wing Shot"
              disabled={disabled}
              onPress={onClose}
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
            <Text style={styles.intro} allowFontScaling>
              Share a photo or short video of wings from this restaurant. Every submission is reviewed;
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
                {allowVideo ? (
                  <ActionButton
                    icon="videocam"
                    label="Record Video"
                    detail="Aim for 7 seconds · 10 seconds maximum"
                    testID="wing-shot.record-video"
                    disabled={disabled}
                    onPress={() => chooseMedia('video')}
                  />
                ) : null}
                {allowPhoto || allowVideo ? (
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
              <WingShotMediaPreview
                media={media}
                disabled={disabled}
                onReplace={replaceMedia}
                onRemove={removeMedia}
              />
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
                <Text style={styles.errorText} allowFontScaling>
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {phase === 'uploading' || phase === 'cancelling' ? (
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
                  <View style={[styles.progressFill, { width: `${safeProgress}%` }]} />
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

            {phase === 'success' ? (
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
                    Your submission is now under review. Approved photos may be featured, and approved
                    creators earn XP, badges, and recognition.
                  </Text>
                </View>
              </View>
            ) : null}

            {phase !== 'success' &&
            phase !== 'uploading' &&
            phase !== 'cancelling' &&
            (allowPhoto || allowVideo) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
                disabled={!canSubmit}
                onPress={submit}
                style={[styles.submitButton, !canSubmit && styles.disabledButton]}
                testID={
                  phase === 'error' || phase === 'cancelled'
                    ? 'wing-shot.upload-retry'
                    : 'wing-shot.submit'
                }
              >
                <Text style={styles.submitText} allowFontScaling>
                  {phase === 'error' || phase === 'cancelled'
                    ? media
                      ? 'Retry upload'
                      : 'Submit Wing Shot'
                    : 'Submit Wing Shot'}
                </Text>
              </Pressable>
            ) : null}

            {phase === 'success' ? (
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={styles.submitButton}
                testID="wing-shot.done"
              >
                <Text style={styles.submitText} allowFontScaling>
                  Done
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

type ActionButtonProps = {
  icon: 'camera' | 'videocam' | 'images';
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF9EF' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D9D1C5',
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
  content: { padding: 20, paddingBottom: 48, gap: 20 },
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
  progressCard: { borderRadius: 14, backgroundColor: '#FFFFFF', padding: 16, gap: 12 },
  progressText: { color: '#1D2430', fontSize: 16, fontWeight: '700' },
  progressTrack: {
    height: 10,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: '#E5DFD6',
  },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: '#A83D18' },
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
