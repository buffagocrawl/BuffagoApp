import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { recognizeReferral } from '../../lib/referrals';
import { REFERRALS_ENABLED } from '../../config/referrals';

export default function ReferralRoute() {
  const { code } = useLocalSearchParams();
  const router = useRouter();
  const referralCode = Array.isArray(code) ? code[0] : code;

  useEffect(() => {
    if (!REFERRALS_ENABLED || typeof referralCode !== 'string' || !referralCode.trim()) return;
    recognizeReferral(referralCode.trim(), {
      source: 'shared_link',
      placement: 'deep_link_route',
      screen: 'referral_link',
    }).catch(() => {});
  }, [referralCode]);

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>BuffaGo</Text>
      <Text style={styles.title}>You&apos;ve been invited to find your next favorite wings.</Text>
      <Text style={styles.body}>
        {REFERRALS_ENABLED
          ? 'Your invitation is saved on this device. Sign in or create an account to continue.'
          : 'Referral invitations are not available right now, but you can still explore Buffago.'}
      </Text>
      <Pressable style={styles.button} onPress={() => router.replace('/auth/login')}>
        <Text style={styles.buttonText}>Continue to BuffaGo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050607', padding: 28, justifyContent: 'center' },
  brand: { color: '#ffb703', fontSize: 24, fontWeight: '900', marginBottom: 28 },
  title: { color: '#fffbe9', fontSize: 32, lineHeight: 38, fontWeight: '900', marginBottom: 18 },
  body: { color: '#d8d3c2', fontSize: 16, lineHeight: 24, marginBottom: 28 },
  button: { backgroundColor: '#ffb703', padding: 16, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#050607', fontSize: 16, fontWeight: '800' },
});
