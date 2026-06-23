import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, Avatar, Button, Card, Text, TextInput, useTheme } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { resolveFriendInviteCode, sendFriendRequest } from '../../lib/friends';

export default function AddFriendCodeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [code, setCode] = useState(typeof params.code === 'string' ? params.code : '');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resolveCode = useCallback(async (value) => {
    const clean = String(value || '').trim();
    if (!clean) return;
    setLoading(true);
    setError('');
    setProfile(null);
    try {
      setProfile(await resolveFriendInviteCode(clean));
    } catch (e) {
      setError(e?.userMessage || e?.message || 'That friend code is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  const resolve = useCallback(() => resolveCode(code), [code, resolveCode]);

  useEffect(() => {
    const initialCode = typeof params.code === 'string' ? params.code : '';
    if (initialCode) resolveCode(initialCode);
  }, [params.code, resolveCode]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/leaderboards'))} />
        <Appbar.Content title="Add Wing Friend" />
      </Appbar.Header>
      <View style={{ padding: 16, gap: 14 }}>
        <TextInput
          mode="outlined"
          label="Friend code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button mode="contained" onPress={resolve} loading={loading} disabled={!code.trim() || loading}>
          Find Friend
        </Button>
        {error ? <Text style={{ color: theme.colors.error }}>{error}</Text> : null}
        {profile ? (
          <Card>
            <Card.Content style={{ alignItems: 'center', gap: 12 }}>
              <Avatar.Text size={64} label={String(profile.username || 'WF').slice(0, 2).toUpperCase()} />
              <Text variant="titleLarge">{profile.username || `Winglet_${profile.user_id.slice(0, 6)}`}</Text>
              <Button
                mode="contained"
                disabled={profile.relationship_status !== 'none'}
                onPress={async () => {
                  setLoading(true);
                  try {
                    const status = await sendFriendRequest(profile.user_id, 'qr');
                    setProfile((value) => ({ ...value, relationship_status: status }));
                  } catch (e) {
                    setError(e?.userMessage || e?.message || 'Could not send request.');
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {profile.relationship_status === 'none'
                  ? 'Add Friend'
                  : profile.relationship_status === 'friends'
                  ? 'Already Friends'
                  : 'Request Sent'}
              </Button>
            </Card.Content>
          </Card>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
