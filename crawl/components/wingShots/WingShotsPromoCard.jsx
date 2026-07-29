import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import { trackEvent } from '../../lib/analytics';
import {
  clearPendingSocialCommunityVisit,
  completePendingSocialCommunityVisit,
  confirmSocialCommunityDestinationOpened,
  getSocialCommunityConfig,
  openConfiguredSocialDestination,
  startSocialCommunityVisit,
} from '../../lib/socialCommunity';

const PLATFORM_META = Object.freeze({
  instagram: { icon: 'instagram', label: 'Open Instagram to follow' },
  facebook: { icon: 'facebook', label: 'Open Facebook to follow' },
});

function friendlyError(error, platform) {
  const code = String(error?.message || error || '');
  if (code.includes('not_configured')) return `${getSocialCommunityConfig(platform).label} is not configured yet.`;
  if (code.includes('authentication_required')) return 'Sign in to earn a one-time community visit badge.';
  return `We could not open ${getSocialCommunityConfig(platform).label}. Try again shortly.`;
}

export default function WingShotsPromoCard({ userId = null }) {
  const [message, setMessage] = useState('');
  const [opening, setOpening] = useState(null);
  const expectsReturnRef = useRef(false);

  const finishVisit = useCallback(async () => {
    try {
      const result = await completePendingSocialCommunityVisit();
      if (!result) return;
      if (result.granted) {
        setMessage(`Community visit recorded: +${result.xp} XP and a ${result.platform} visitor badge.`);
      } else if (result.reason === 'already_earned') {
        setMessage('You already earned this one-time community visit badge.');
      }
    } catch (error) {
      const code = String(error?.message || error || '');
      if (!code.includes('not_eligible')) setMessage('Your social visit is pending. Return here to finish it.');
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && expectsReturnRef.current) {
        expectsReturnRef.current = false;
        finishVisit();
      }
    });
    finishVisit();
    return () => subscription.remove();
  }, [finishVisit]);

  const openPlatform = useCallback(async (platform) => {
    setMessage('');
    setOpening(platform);
    try {
      await trackEvent({
        eventName: 'social_follow_cta_clicked',
        screen: 'home',
        userId,
        metadata: { platform, verification_claim: 'external_visit_only' },
      });
      const pending = userId ? await startSocialCommunityVisit(platform) : null;
      await openConfiguredSocialDestination(platform);
      if (pending) await confirmSocialCommunityDestinationOpened(pending);
      expectsReturnRef.current = true;
      if (!userId) setMessage('Sign in to earn a one-time community visit badge.');
    } catch (error) {
      expectsReturnRef.current = false;
      await clearPendingSocialCommunityVisit();
      setMessage(friendlyError(error, platform));
    } finally {
      setOpening(null);
    }
  }, [userId]);

  return (
    <View testID="wing-shots-home-promo" accessibilityLabel="Get Featured with Wing Shots" style={styles.card}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="camera-outline" size={22} color="#FFB36F" />
        <Text style={styles.title}>Get Featured</Text>
      </View>
      <Text style={styles.body}>
        Upload a Wing Shot after an eligible in-person rating. Jalapeño checks approved community submissions daily for BuffaGo&apos;s Instagram and Facebook.
      </Text>
      <Text style={styles.callout}>
        Upload your Wing Shot—check our Instagram daily to see if you’re featured!
      </Text>

      <View style={styles.actions}>
        {Object.entries(PLATFORM_META).map(([platform, meta]) => (
          <Pressable
            key={platform}
            testID={`wing-shots-${platform}-cta`}
            accessibilityRole="link"
            accessibilityLabel={meta.label}
            disabled={opening != null}
            onPress={() => openPlatform(platform)}
            style={({ pressed }) => [
              styles.action,
              pressed && styles.actionPressed,
              opening != null && styles.actionDisabled,
            ]}
          >
            <MaterialCommunityIcons name={meta.icon} size={20} color="#FFFFFF" />
            <Text style={styles.actionText}>{opening === platform ? 'Opening…' : meta.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.disclosure}>
        Opening a social page can earn a one-time visitor badge. BuffaGo does not claim this verifies a follow.
      </Text>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,122,24,0.38)',
    backgroundColor: 'rgba(255,122,24,0.10)',
    padding: 14,
    gap: 9,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 19, lineHeight: 24, fontWeight: '900', color: 'rgba(255,255,255,0.98)' },
  body: { fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.88)' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '900', color: '#FFCB9B' },
  actions: { gap: 8, marginTop: 2 },
  action: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  actionDisabled: { opacity: 0.55 },
  actionText: { fontSize: 14, lineHeight: 19, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
  disclosure: { fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.68)' },
  message: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: '#D7F5DA' },
});
