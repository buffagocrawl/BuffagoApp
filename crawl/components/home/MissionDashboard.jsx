import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { shouldShowMissionHost } from '../../lib/engagement/mascotMoments';
import { BuffagoMascot } from '../mascot/BuffagoMascot';

export function PrimaryMissionCard({ action, mission, activeCrawl, distanceMiles, onPress }) {
  const showMissionHost = shouldShowMissionHost({
    mission,
    activeCrawl,
    actionType: action.type,
  });
  const progress = activeCrawl
    ? activeCrawl.totalStops
      ? activeCrawl.visitedCount / activeCrawl.totalStops
      : 0
    : mission?.target
      ? mission.current / mission.target
      : 0;

  return (
    <View style={styles.card} accessibilityLabel={`Next move: ${action.title}`}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{showMissionHost ? 'BUFFAGO’S DAILY MISSION' : 'YOUR NEXT MOVE'}</Text>
          <Text style={styles.title}>{action.title}</Text>
        </View>
        {showMissionHost ? (
          <BuffagoMascot
            pose="guide"
            mood={mission.current >= mission.target ? 'celebrating' : 'encouraging'}
            size="small"
            animated={false}
            decorative
            testID="primary-mission-host-mascot"
            analyticsSurface="mission-status"
            analyticsMomentType="mission"
            sourceScreen="home"
          />
        ) : null}
      </View>
      {action.subtitle ? <Text style={styles.subtitle}>{action.subtitle}</Text> : null}

      {activeCrawl || mission ? (
        <>
          <View style={styles.progressTrack} accessibilityRole="progressbar">
            <View style={[styles.progressFill, { width: `${Math.round(Math.min(1, progress) * 100)}%` }]} />
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {activeCrawl
                ? `${activeCrawl.visitedCount}/${activeCrawl.totalStops} stops${distanceMiles != null ? ` · ${distanceMiles.toFixed(1)} mi to next` : ''}`
                : `${mission.current}/${mission.target} · ${mission.reward}`}
            </Text>
            {mission?.timeRemaining ? <Text style={styles.time}>{mission.timeRemaining}</Text> : null}
          </View>
        </>
      ) : null}

      {action.type === 'loading' ? (
        <ActivityIndicator style={{ marginTop: 16 }} color="#FF7A18" />
      ) : action.ctaLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.ctaLabel}
          onPress={onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>{action.ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function CompactMissionCard({ mission, onPress }) {
  if (!mission) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${mission.title}, ${mission.current} of ${mission.target}`}
      onPress={onPress}
      style={({ pressed }) => [styles.compact, pressed && styles.pressed]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>TODAY’S MISSION · {mission.reward}</Text>
        <Text style={styles.compactTitle}>{mission.title}</Text>
        <Text style={styles.subtitle}>{mission.detail}</Text>
      </View>
      <View style={styles.compactProgress}>
        <Text style={styles.compactCount}>{mission.current}/{mission.target}</Text>
        <Text style={styles.time}>{mission.timeRemaining}</Text>
      </View>
    </Pressable>
  );
}

export function WeeklyChallengeCard({ challenge, loading, error, onPress, onRetry, onDismiss }) {
  if (!challenge && !loading && !error) return null;
  return (
    <View style={styles.weekly}>
      <Text style={styles.eyebrow}>WEEKLY CHALLENGE</Text>
      {loading ? <ActivityIndicator color="#FF7A18" style={{ marginTop: 12 }} /> : null}
      {error ? (
        <>
          <Text style={styles.subtitle}>Challenge progress couldn’t refresh. Your saved progress is safe.</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </>
      ) : challenge ? (
        <>
          <Text style={styles.compactTitle}>{challenge.title}</Text>
          <Text style={styles.subtitle}>{challenge.current}/{challenge.target} · {challenge.reward} · {challenge.timeRemaining}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(Math.min(1, challenge.ratio || 0) * 100)}%` }]} />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={challenge.claimed}
            onPress={onPress}
            style={({ pressed }) => [styles.retry, challenge.complete && !challenge.claimed && styles.claim, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>{challenge.ctaLabel}</Text>
          </Pressable>
          {challenge.complete && onDismiss ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hide completed weekly challenge until next week"
              onPress={onDismiss}
              style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
            >
              <Text style={styles.dismissText}>Hide until next week</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,122,24,0.7)',
    backgroundColor: 'rgba(255,122,24,0.11)',
    padding: 16,
  },
  eyebrow: { color: '#FF9A4F', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { color: '#FFF', fontSize: 24, fontWeight: '900', marginTop: 5, lineHeight: 29 },
  subtitle: { color: 'rgba(255,255,255,0.74)', marginTop: 5, lineHeight: 19 },
  progressTrack: { height: 8, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: 14 },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: '#FF7A18' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 7 },
  meta: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '800', flex: 1 },
  time: { color: 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: '700' },
  button: { minHeight: 50, borderRadius: 15, backgroundColor: '#FF7A18', alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  buttonText: { color: '#1A0D04', fontSize: 16, fontWeight: '900' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  compact: {
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  compactTitle: { color: '#FFF', fontSize: 17, fontWeight: '900', marginTop: 4 },
  compactProgress: { alignItems: 'flex-end', minWidth: 62 },
  compactCount: { color: '#FF9A4F', fontSize: 20, fontWeight: '900', marginBottom: 4 },
  weekly: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.045)', padding: 14 },
  retry: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,122,24,0.65)', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  dismiss: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginTop: 2 },
  dismissText: { color: 'rgba(255,255,255,0.62)', fontSize: 12, fontWeight: '800' },
  claim: { backgroundColor: '#FF7A18' },
  retryText: { color: '#FFF', fontWeight: '900' },
});
