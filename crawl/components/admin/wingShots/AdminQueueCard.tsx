import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AdminQueueItem, WingReviewAction } from '../../../lib/adminWingShots';
import { AdminMediaPreview } from './AdminMediaPreview';
import { REVIEW_ACTIONS } from './ReviewActionSheet';

type Props = {
  item: AdminQueueItem;
  onAction: (action: WingReviewAction) => void;
};

const ACTION_ORDER: WingReviewAction[] = [
  'approve',
  'reject',
  'retry_processing',
  'prioritize',
  'remove_priority',
  'mark_abuse',
  'withdraw_from_queue',
];

function percentage(value: number | null) {
  return value == null ? 'Pending' : `${Math.round(value * 100)}%`;
}

function score(value: number | null) {
  return value == null ? 'Pending' : Number(value).toFixed(1);
}

function dateTime(value: string | null | undefined) {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unavailable' : parsed.toLocaleString();
}

function humanize(value: string | null | undefined) {
  return value ? value.replaceAll('_', ' ') : 'None';
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} allowFontScaling>
        {label}
      </Text>
      <Text style={styles.metricValue} allowFontScaling>
        {value}
      </Text>
    </View>
  );
}

export function AdminQueueCard({ item, onAction }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const summary = item.moderation_summary;
  const flags = summary?.flags ?? [];
  const cityState = [
    item.restaurant.city,
    item.restaurant.state_code || item.restaurant.state_name,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={styles.card}
      testID={`wing-admin.queue.${item.submission_id}`}
      accessibilityLabel={`Wing Shot review item for ${item.restaurant.name}`}
    >
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <Text style={styles.restaurant} accessibilityRole="header" allowFontScaling>
            {item.restaurant.name}
          </Text>
          {cityState ? (
            <Text style={styles.location} allowFontScaling>
              {cityState}
            </Text>
          ) : null}
          <Text style={styles.contributor} allowFontScaling>
            @{item.contributor.username || 'deleted-account'} · {item.media_type}
          </Text>
        </View>
        {item.priority > 0 ? (
          <View style={styles.priority}>
            <Ionicons name="flag" size={16} color="#050607" />
            <Text style={styles.priorityText} allowFontScaling>
              {item.priority}
            </Text>
          </View>
        ) : null}
      </View>

      <AdminMediaPreview submissionId={item.submission_id} mediaType={item.media_type} />

      <View style={styles.metrics}>
        <Metric label="Wing confidence" value={percentage(item.wing_confidence)} />
        <Metric label="Quality" value={score(item.quality_score)} />
        <Metric label="Content score" value={score(item.content_score)} />
        <Metric label="Prior features" value={item.contributor.prior_features} />
      </View>

      <View style={styles.signalPanel}>
        <Text style={styles.sectionTitle} allowFontScaling>
          Review signals
        </Text>
        <Text style={styles.signalText} allowFontScaling>
          Moderation: {humanize(item.moderation_status)} · Wings:{' '}
          {humanize(item.wing_verification_status)}
        </Text>
        <Text style={styles.signalText} allowFontScaling>
          Spam risk: {summary?.spam_risk ?? 'pending'} · Duplicate risk:{' '}
          {summary?.duplicate_risk ?? 'pending'}
        </Text>
        {flags.length ? (
          <View style={styles.flags}>
            {flags.map((flag) => (
              <View key={flag} style={styles.flag}>
                <Text style={styles.flagText} allowFontScaling>
                  {humanize(flag)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noFlags} allowFontScaling>
            No visible safety flags reported
          </Text>
        )}
        {summary?.explanation ? (
          <Text
            style={styles.explanation}
            allowFontScaling
            testID={`wing-admin.queue.${item.submission_id}.flag-explanation`}
          >
            Why it was flagged: {summary.explanation}
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${detailsOpen ? 'Hide' : 'Show'} rating and audit details`}
        accessibilityState={{ expanded: detailsOpen }}
        onPress={() => setDetailsOpen((current) => !current)}
        style={({ pressed }) => [styles.detailsToggle, pressed && styles.pressed]}
        testID={`wing-admin.queue.${item.submission_id}.details-toggle`}
      >
        <Text style={styles.detailsToggleText} allowFontScaling>
          {detailsOpen ? 'Hide review details' : 'Show review details'}
        </Text>
        <Ionicons
          name={detailsOpen ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#F2A93B"
        />
      </Pressable>

      {detailsOpen ? <ReviewDetails item={item} /> : null}

      <Text style={styles.sectionTitle} allowFontScaling>
        Reviewer actions
      </Text>
      <Text style={styles.actionHelp} allowFontScaling>
        Every action requires a reason and notes and creates an audit receipt.
      </Text>
      <View style={styles.actions}>
        {ACTION_ORDER.map((action) => (
          <Pressable
            key={action}
            accessibilityRole="button"
            accessibilityLabel={`${REVIEW_ACTIONS[action].label} this Wing Shot`}
            onPress={() => onAction(action)}
            style={({ pressed }) => [
              styles.action,
              action === 'approve' && styles.approve,
              action === 'reject' && styles.reject,
              pressed && styles.pressed,
            ]}
            testID={`wing-admin.queue.${item.submission_id}.action.${action}`}
          >
            <Text
              style={[
                styles.actionText,
                action === 'approve' && styles.actionTextDark,
                action === 'reject' && styles.rejectText,
              ]}
              allowFontScaling
            >
              {REVIEW_ACTIONS[action].label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ReviewDetails({ item }: { item: AdminQueueItem }) {
  return (
    <View style={styles.details} testID={`wing-admin.queue.${item.submission_id}.details`}>
      <Text style={styles.sectionTitle} allowFontScaling>
        Rating
      </Text>
      <View style={styles.metrics}>
        <Metric label="Overall" value={item.rating.overall ?? '—'} />
        <Metric label="Crispiness" value={item.rating.crispiness ?? '—'} />
        <Metric label="Sauce" value={item.rating.sauce ?? '—'} />
        <Metric label="Meat" value={item.rating.meat ?? '—'} />
      </View>
      <Text style={styles.detailText} allowFontScaling>
        Wings eaten: {item.rating.wings_eaten ?? '—'} · Would order again:{' '}
        {item.rating.would_order_again == null
          ? 'Not answered'
          : item.rating.would_order_again
            ? 'Yes'
            : 'No'}
      </Text>
      <Text style={styles.detailText} allowFontScaling>
        Rated {dateTime(item.rating.rated_at)}
      </Text>

      <Text style={styles.sectionTitle} allowFontScaling>
        Consent and attribution
      </Text>
      <Text style={styles.detailText} allowFontScaling>
        Consent {item.consent.version} recorded {dateTime(item.consent.consented_at)}
      </Text>
      <Text style={styles.detailText} allowFontScaling>
        Attribution: {humanize(item.consent.attribution_preference)}
      </Text>

      <Text style={styles.sectionTitle} allowFontScaling>
        Processing
      </Text>
      {item.processing.length ? (
        item.processing.map((job) => (
          <Text key={job.kind} style={styles.detailText} allowFontScaling>
            {humanize(job.kind)}: {humanize(job.status)} · attempt {job.attempt_count}/
            {job.max_attempts}
            {job.last_error_code ? ` · ${humanize(job.last_error_code)}` : ''}
          </Text>
        ))
      ) : (
        <Text style={styles.detailText} allowFontScaling>
          No processing summary available
        </Text>
      )}

      <Text style={styles.sectionTitle} allowFontScaling>
        Duplicate and abuse signals
      </Text>
      {item.duplicate_signals.length ? (
        item.duplicate_signals.map((signal, index) => (
          <Text key={`${signal.type}-${signal.created_at}-${index}`} style={styles.detailText} allowFontScaling>
            {humanize(signal.type)} · {signal.severity}
            {signal.similarity == null ? '' : ` · ${Math.round(signal.similarity * 100)}%`}
          </Text>
        ))
      ) : (
        <Text style={styles.detailText} allowFontScaling>
          No duplicate or abuse signals recorded
        </Text>
      )}

      <Text style={styles.sectionTitle} allowFontScaling>
        Generated caption preview
      </Text>
      {item.generated_posts.length ? (
        item.generated_posts.map((post, index) => (
          <View key={`${post.platform}-${index}`} style={styles.caption}>
            <Text style={styles.captionPlatform} allowFontScaling>
              {post.platform} · {humanize(post.status)}
            </Text>
            <Text style={styles.captionText} selectable allowFontScaling>
              {post.caption}
            </Text>
            {post.alt_text ? (
              <Text style={styles.altText} allowFontScaling>
                Alt text: {post.alt_text}
              </Text>
            ) : null}
          </View>
        ))
      ) : (
        <Text style={styles.detailText} allowFontScaling>
          No generated post yet
        </Text>
      )}

      <Text style={styles.sectionTitle} allowFontScaling>
        Status history
      </Text>
      {item.status_history.length ? (
        item.status_history.map((entry, index) => (
          <Text
            key={`${entry.occurred_at}-${index}`}
            style={styles.detailText}
            allowFontScaling
          >
            {humanize(entry.from)} → {humanize(entry.to)} · {humanize(entry.source)} ·{' '}
            {dateTime(entry.occurred_at)}
          </Text>
        ))
      ) : (
        <Text style={styles.detailText} allowFontScaling>
          No status transitions recorded
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#343B47',
    backgroundColor: '#11151C',
    padding: 16,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headingText: {
    flex: 1,
  },
  restaurant: {
    color: '#FFFFFF',
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '900',
  },
  location: {
    color: '#B7BEC9',
    fontSize: 15,
    lineHeight: 22,
  },
  contributor: {
    color: '#F2A93B',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  priority: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: '#F2A93B',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  priorityText: {
    color: '#050607',
    fontSize: 14,
    fontWeight: '900',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  metric: {
    flexGrow: 1,
    flexBasis: 125,
    minHeight: 66,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#1A202A',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  metricLabel: {
    color: '#AEB5C0',
    fontSize: 13,
    lineHeight: 18,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  signalPanel: {
    gap: 7,
    borderLeftWidth: 4,
    borderLeftColor: '#F2A93B',
    borderRadius: 10,
    backgroundColor: '#1A202A',
    padding: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '900',
  },
  signalText: {
    color: '#D6DAE1',
    fontSize: 14,
    lineHeight: 21,
  },
  flags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  flag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EF7169',
    backgroundColor: '#381C1C',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  flagText: {
    color: '#FFC7C2',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  noFlags: {
    color: '#B4DEC0',
    fontSize: 14,
    lineHeight: 20,
  },
  explanation: {
    color: '#FFE1AE',
    fontSize: 14,
    lineHeight: 21,
  },
  detailsToggle: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4C5563',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  detailsToggleText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
  },
  details: {
    gap: 9,
  },
  detailText: {
    color: '#C7CCD5',
    fontSize: 14,
    lineHeight: 21,
  },
  caption: {
    gap: 6,
    borderRadius: 12,
    backgroundColor: '#1A202A',
    padding: 12,
  },
  captionPlatform: {
    color: '#F2A93B',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
  },
  altText: {
    color: '#B8BEC8',
    fontSize: 13,
    lineHeight: 20,
  },
  actionHelp: {
    marginTop: -8,
    color: '#AEB5C0',
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  action: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#5B6472',
    backgroundColor: '#1A202A',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  approve: {
    borderColor: '#F2A93B',
    backgroundColor: '#F2A93B',
  },
  reject: {
    borderColor: '#EF7169',
    backgroundColor: '#351B1B',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    textAlign: 'center',
  },
  actionTextDark: {
    color: '#050607',
  },
  rejectText: {
    color: '#FFC7C2',
  },
  pressed: {
    opacity: 0.72,
  },
});
