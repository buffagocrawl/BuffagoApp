// app/reset.jsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput, Button, ActivityIndicator, HelperText, useTheme, Card } from 'react-native-paper';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

function parseParamsFromUrl(url) {
  if (!url) return {};
  // Grab both query (?a=b) and hash (#a=b) parts
  const [, query = ''] = url.split('?');
  const [, hash = '']  = url.split('#');

  const toMap = (s) =>
    s
      .split('&')
      .filter(Boolean)
      .reduce((acc, kv) => {
        const [k, v] = kv.split('=');
        if (!k) return acc;
        acc[decodeURIComponent(k)] = decodeURIComponent(v || '');
        return acc;
      }, {});

  return { ...toMap(query), ...toMap(hash) };
}

export default function Reset() {
  const { colors } = useTheme();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [validLink, setValidLink] = useState(false);
  const [error, setError] = useState('');

  const [password, setPassword] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        const { access_token, refresh_token, type, token_hash } = parseParamsFromUrl(initialUrl);

        // Primary path: Supabase appended access/refresh tokens (most common)
        if (type === 'recovery' && access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (setErr) throw setErr;
          if (alive) {
            setValidLink(true);
            setChecking(false);
          }
          return;
        }

        // Fallback: sometimes you might only get token_hash (rare on mobile)
        if (type === 'recovery' && token_hash) {
          const { error: verifyErr } = await supabase.auth.verifyOtp({
            type: 'recovery',
            token_hash,
          });
          if (verifyErr) throw verifyErr;
          if (alive) {
            setValidLink(true);
            setChecking(false);
          }
          return;
        }

        // If we get here, we didn’t find what we need
        if (alive) {
          setError('Invalid or expired reset link.');
          setValidLink(false);
          setChecking(false);
        }
      } catch (e) {
        if (alive) {
          setError(e?.message || String(e));
          setValidLink(false);
          setChecking(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const onSubmit = async () => {
    setError('');
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== pw2) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;
      // Done — go to login or home
      router.replace('/auth/login');
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, opacity: 0.8 }}>Validating reset link…</Text>
      </SafeAreaView>
    );
  }

  if (!validLink) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <Text variant="titleMedium" style={{ marginBottom: 6 }}>Invalid reset link</Text>
        <Text style={{ opacity: 0.8, textAlign: 'center', paddingHorizontal: 16 }}>
          {error || 'Please request a new password reset email and try again.'}
        </Text>
        <Button style={{ marginTop: 16 }} mode="contained" onPress={() => router.replace('/auth/login')}>
          Back to sign in
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Card style={{ borderRadius: 16, paddingVertical: 8 }}>
        <Card.Title title="Reset your password" />
        <Card.Content>
          <TextInput
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={{ marginBottom: 8 }}
          />
          <TextInput
            label="Confirm password"
            value={pw2}
            onChangeText={setPw2}
            secureTextEntry
            style={{ marginBottom: 8 }}
          />
          <HelperText type="info" visible>
            Password must be at least 6 characters.
          </HelperText>
          {error ? <HelperText type="error" visible>{error}</HelperText> : null}
          <Button mode="contained" onPress={onSubmit} loading={saving} disabled={saving}>
            Update password
          </Button>
        </Card.Content>
      </Card>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
