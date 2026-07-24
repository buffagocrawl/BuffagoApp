import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PENDING_REFERRAL_KEY } from '../../lib/referrals';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ReferralRoute() {
  const { code } = useLocalSearchParams();
  const router = useRouter();
  const referralCode = Array.isArray(code) ? code[0] : code;

  useEffect(() => {
    if (typeof referralCode === 'string' && referralCode.trim()) {
      AsyncStorage.setItem(PENDING_REFERRAL_KEY, referralCode.trim()).catch(() => {});
    }
  }, [referralCode]);

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>BuffaGo</Text>
      <Text style={styles.title}>You’ve been invited to find your next favorite wings.</Text>
      <Text style={styles.body}>
        Your invitation is saved on this device. Sign in or create an account to continue.
        Referral rewards are currently unavailable.
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
