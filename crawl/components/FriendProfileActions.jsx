import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  declineFriendRequest,
  getFriendStatus,
  removeFriend,
  sendFriendRequest,
  unblockUser,
} from '../lib/friends';

export default function FriendProfileActions({ targetUserId, sourceSurface = 'profile' }) {
  const theme = useTheme();
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!targetUserId) return;
    try {
      setStatus(await getFriendStatus(targetUserId));
    } catch {
      setStatus('unavailable');
    }
  }, [targetUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = useCallback(
    async (action) => {
      setBusy(true);
      setError('');
      try {
        await action();
        await refresh();
      } catch (e) {
        setError(e?.userMessage || e?.message || 'Could not update friendship.');
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  if (!targetUserId || status === 'loading' || status === 'unavailable') return null;

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
        {status === 'none' ? (
          <Button mode="contained" icon="account-plus" loading={busy} onPress={() => run(() => sendFriendRequest(targetUserId, sourceSurface))}>
            Add Friend
          </Button>
        ) : null}
        {status === 'pending_sent' ? (
          <Button mode="outlined" loading={busy} onPress={() => run(() => cancelFriendRequest(targetUserId))}>
            Cancel Request
          </Button>
        ) : null}
        {status === 'pending_received' ? (
          <>
            <Button mode="contained" loading={busy} onPress={() => run(() => acceptFriendRequest(targetUserId))}>
              Accept Friend
            </Button>
            <Button mode="outlined" disabled={busy} onPress={() => run(() => declineFriendRequest(targetUserId))}>
              Decline
            </Button>
          </>
        ) : null}
        {status === 'friends' ? (
          <Button
            mode="outlined"
            loading={busy}
            onPress={() =>
              Alert.alert('Remove friend?', 'This removes the friendship for both users.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => run(() => removeFriend(targetUserId)) },
              ])
            }
          >
            Remove Friend
          </Button>
        ) : null}
        {status === 'blocked' ? (
          <Button mode="outlined" loading={busy} onPress={() => run(() => unblockUser(targetUserId))}>
            Unblock
          </Button>
        ) : (
          <Button
            mode="text"
            textColor={theme.colors.error}
            disabled={busy}
            onPress={() =>
              Alert.alert('Block user?', 'They will be hidden from search, feeds, and friend interactions.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Block', style: 'destructive', onPress: () => run(() => blockUser(targetUserId)) },
              ])
            }
          >
            Block
          </Button>
        )}
      </View>
      {error ? <Text style={{ color: theme.colors.error, textAlign: 'center' }}>{error}</Text> : null}
    </View>
  );
}
