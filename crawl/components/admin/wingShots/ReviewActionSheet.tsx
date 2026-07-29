import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import {
  AdminWingShotsError,
  submitWingAdminReview,
  type AdminQueueItem,
  type WingReviewAction,
  type WingReviewReason,
} from '../../../lib/adminWingShots';

type ReasonChoice = {
  key: WingReviewReason;
  label: string;
};

type ActionDefinition = {
  label: string;
  confirmLabel: string;
  reasons: ReasonChoice[];
  warning?: string;
};

export const REVIEW_ACTIONS: Record<WingReviewAction, ActionDefinition> = {
  approve: {
    label: 'Approve',
    confirmLabel: 'Confirm approval',
    reasons: [
      { key: 'standard_acceptable', label: 'Meets review policy' },
      { key: 'documented_override', label: 'Documented model override' },
    ],
    warning:
      'Approval awards Creator XP. Use an override only after reviewing every visible safety flag.',
  },
  reject: {
    label: 'Reject',
    confirmLabel: 'Confirm rejection',
    reasons: [
      { key: 'not_wings', label: 'Does not show wings' },
      { key: 'unsafe_content', label: 'Unsafe content' },
      { key: 'privacy_concern', label: 'Privacy concern' },
      { key: 'duplicate', label: 'Duplicate submission' },
      { key: 'spam_abuse', label: 'Spam or abuse' },
      { key: 'rights_concern', label: 'Rights or consent concern' },
      { key: 'quality_unusable', label: 'Media cannot be used' },
      { key: 'other_policy', label: 'Other policy reason' },
    ],
  },
  retry_processing: {
    label: 'Retry processing',
    confirmLabel: 'Send back to processing',
    reasons: [{ key: 'processing_retry', label: 'Processing retry' }],
  },
  prioritize: {
    label: 'Prioritize',
    confirmLabel: 'Add priority',
    reasons: [{ key: 'editorial_priority', label: 'Editorial priority' }],
  },
  remove_priority: {
    label: 'Remove priority',
    confirmLabel: 'Remove priority',
    reasons: [{ key: 'editorial_priority_removed', label: 'Priority no longer needed' }],
  },
  withdraw_from_queue: {
    label: 'Remove from queue',
    confirmLabel: 'Remove from queue',
    reasons: [{ key: 'queue_removal', label: 'Administrative queue removal' }],
  },
  mark_abuse: {
    label: 'Mark abuse',
    confirmLabel: 'Record abuse signal',
    reasons: [
      { key: 'spam_abuse', label: 'Spam pattern' },
      { key: 'duplicate_abuse', label: 'Duplicate abuse' },
      { key: 'policy_abuse', label: 'Policy abuse' },
    ],
  },
};

type Props = {
  item: AdminQueueItem;
  action: WingReviewAction | null;
  onDismiss: () => void;
  onCompleted: (receiptId: string) => void;
};

export function ReviewActionSheet({ item, action, onDismiss, onCompleted }: Props) {
  const definition = action ? REVIEW_ACTIONS[action] : null;
  const [reason, setReason] = useState<WingReviewReason | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason(definition?.reasons.length === 1 ? definition.reasons[0].key : null);
    setNotes('');
    setError(null);
  }, [action, definition]);

  const canSubmit = useMemo(
    () => Boolean(action && reason && notes.trim().length >= 8 && !saving),
    [action, notes, reason, saving],
  );

  if (!action || !definition) return null;

  const submit = async () => {
    if (!reason || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const receiptId = await submitWingAdminReview({
        submissionId: item.submission_id,
        action,
        reason,
        notes,
      });
      onCompleted(receiptId);
    } catch (caught) {
      setError(
        caught instanceof AdminWingShotsError
          ? caught.message
          : 'The review action could not be recorded. Try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      animationType="none"
      transparent={false}
      visible
      onRequestClose={saving ? undefined : onDismiss}
      testID="wing-admin.review-modal"
    >
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.safe}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            testID={`wing-admin.review.${action}`}
          >
            <Text style={styles.eyebrow} allowFontScaling>
              INTERNAL REVIEW
            </Text>
            <Text style={styles.title} accessibilityRole="header" allowFontScaling>
              {definition.label}
            </Text>
            <Text style={styles.context} allowFontScaling>
              {item.restaurant.name} · @{item.contributor.username || 'deleted-account'}
            </Text>

            {definition.warning ? (
              <View
                style={styles.warning}
                accessibilityRole="alert"
                testID="wing-admin.review-warning"
              >
                <Text style={styles.warningText} allowFontScaling>
                  {definition.warning}
                </Text>
              </View>
            ) : null}

            <Text style={styles.label} allowFontScaling>
              Reason
            </Text>
            <View style={styles.choices}>
              {definition.reasons.map((choice) => {
                const selected = reason === choice.key;
                return (
                  <Pressable
                    key={choice.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={choice.label}
                    disabled={saving}
                    onPress={() => setReason(choice.key)}
                    style={[styles.choice, selected && styles.choiceSelected]}
                    testID={`wing-admin.review.reason.${choice.key}`}
                  >
                    <Text
                      style={[styles.choiceText, selected && styles.choiceTextSelected]}
                      allowFontScaling
                    >
                      {choice.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label} allowFontScaling>
              Reviewer notes
            </Text>
            <Text style={styles.help} allowFontScaling>
              Required for the audit record. Be specific and avoid copying sensitive classifier
              details.
            </Text>
            <TextInput
              accessibilityLabel="Required reviewer notes"
              editable={!saving}
              multiline
              maxLength={1000}
              onChangeText={setNotes}
              placeholder="Describe the visible evidence and policy basis…"
              placeholderTextColor="#89909C"
              style={styles.notes}
              textAlignVertical="top"
              value={notes}
              testID="wing-admin.review.notes"
            />
            <Text style={styles.counter} allowFontScaling>
              {notes.trim().length}/1000 · minimum 8
            </Text>

            {reason === 'documented_override' ? (
              <Text
                style={styles.override}
                accessibilityRole="alert"
                allowFontScaling
                testID="wing-admin.review.override-notice"
              >
                This records a human override of moderation and wing verification. Confirm the
                processed media clearly supports the decision.
              </Text>
            ) : null}

            {error ? (
              <Text
                style={styles.error}
                accessibilityLiveRegion="assertive"
                allowFontScaling
                testID="wing-admin.review.error"
              >
                {error}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={definition.confirmLabel}
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={submit}
              style={({ pressed }) => [
                styles.confirm,
                !canSubmit && styles.disabled,
                pressed && styles.pressed,
              ]}
              testID="wing-admin.review.submit"
            >
              {saving ? (
                <ActivityIndicator color="#050607" />
              ) : (
                <Text style={styles.confirmText} allowFontScaling>
                  {definition.confirmLabel}
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel review action"
              disabled={saving}
              onPress={onDismiss}
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
              testID="wing-admin.review.cancel"
            >
              <Text style={styles.cancelText} allowFontScaling>
                Cancel
              </Text>
            </Pressable>

            <Text style={styles.legal} allowFontScaling>
              Approval authorizes use under the recorded contributor consent. It does not transfer
              media ownership or replace a rights/privacy review.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#090B0F',
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
    gap: 12,
  },
  eyebrow: {
    color: '#F2A93B',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '900',
  },
  context: {
    color: '#C5CAD3',
    fontSize: 16,
    lineHeight: 23,
  },
  warning: {
    borderLeftWidth: 4,
    borderLeftColor: '#F2A93B',
    borderRadius: 8,
    backgroundColor: '#2B2418',
    padding: 12,
  },
  warningText: {
    color: '#FFE1AE',
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
  },
  help: {
    color: '#B4BAC5',
    fontSize: 14,
    lineHeight: 21,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  choice: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4B5361',
    borderRadius: 12,
    backgroundColor: '#151A22',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  choiceSelected: {
    borderColor: '#F2A93B',
    backgroundColor: '#302616',
  },
  choiceText: {
    color: '#D7DBE3',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  choiceTextSelected: {
    color: '#FFE1AE',
  },
  notes: {
    minHeight: 132,
    borderWidth: 1,
    borderColor: '#4B5361',
    borderRadius: 12,
    backgroundColor: '#151A22',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 23,
  },
  counter: {
    color: '#979EAA',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'right',
  },
  override: {
    color: '#FFD7A0',
    fontSize: 15,
    lineHeight: 22,
  },
  error: {
    color: '#FFB4AB',
    fontSize: 15,
    lineHeight: 22,
  },
  confirm: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#F2A93B',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  confirmText: {
    color: '#050607',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  cancel: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#666E7B',
    paddingHorizontal: 16,
  },
  cancelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  legal: {
    color: '#979EAA',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  disabled: {
    opacity: 0.48,
  },
  pressed: {
    opacity: 0.72,
  },
});
