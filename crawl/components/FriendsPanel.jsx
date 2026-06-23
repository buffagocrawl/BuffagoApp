import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { Avatar, Button, Card, Dialog, Divider, Portal, Searchbar, Text, useTheme } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { useRouter } from 'expo-router';
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  declineFriendRequest,
  friendInviteUrl,
  getFriendInviteCode,
  getBlockedUsers,
  getFriends,
  getPendingInvites,
  markFriendActivitySeen,
  removeFriend,
  searchUsersForFriends,
  sendFriendRequest,
  unblockUser,
} from '../lib/friends';
import { trackEvent } from '../lib/analytics';

const initials = (name) =>
  String(name || 'Wing Friend')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();

const displayName = (row) =>
  String(row?.display_name || row?.username || '').trim() ||
  `Winglet_${String(row?.user_id || '').slice(0, 6)}`;

export default function FriendsPanel({ pendingBadge = 0, activityBadge = 0, onBadgeChange }) {
  const theme = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [invites, setInvites] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCode, setQrCode] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [friendRows, inviteRows, blockedRows] = await Promise.all([
        getFriends(),
        getPendingInvites(),
        getBlockedUsers(),
      ]);
      setFriends(friendRows);
      setInvites(inviteRows);
      setBlockedUsers(blockedRows);
    } catch (e) {
      setError(e?.userMessage || e?.message || 'Could not load friends.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    trackEvent({ eventName: 'friends_tab_opened', screen: 'friends' });
  }, [load]);

  useEffect(() => {
    if (tab === 'pending') {
      markFriendActivitySeen('requests').finally(() => onBadgeChange?.());
      trackEvent({ eventName: 'friend_request_received_viewed', screen: 'friends' });
    } else {
      markFriendActivitySeen('activity').finally(() => onBadgeChange?.());
    }
  }, [tab, onBadgeChange]);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        setResults(await searchUsersForFriends(clean));
      } catch (e) {
        setError(e?.userMessage || e?.message || 'Search failed.');
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

  const run = useCallback(
    async (targetId, action) => {
      setBusyId(targetId);
      setError('');
      try {
        const actionResult = await action();
        await load();
        setResults((rows) =>
          rows.map((row) =>
            row.user_id === targetId && typeof actionResult === 'string'
              ? { ...row, relationship_status: actionResult }
              : row
          )
        );
        onBadgeChange?.();
      } catch (e) {
        setError(e?.userMessage || e?.message || 'Action failed.');
      } finally {
        setBusyId(null);
      }
    },
    [load, onBadgeChange]
  );

  const openProfile = useCallback(
    (row, sourceSurface) => {
      trackEvent({
        eventName: 'friend_profile_opened',
        screen: 'friends',
        metadata: { target_user_id: row.user_id, source_surface: sourceSurface },
      });
      router.push({
        pathname: '/profile/history',
        params: { userId: row.user_id, sourceSurface },
      });
    },
    [router]
  );

  const openQr = useCallback(async () => {
    setError('');
    try {
      const code = await getFriendInviteCode();
      setQrCode(code);
      setQrOpen(true);
      trackEvent({ eventName: 'friend_qr_opened', screen: 'friends' });
    } catch (e) {
      setError(e?.userMessage || e?.message || 'Could not create your friend code.');
    }
  }, []);

  const shareQr = useCallback(async () => {
    if (!qrCode) return;
    await Share.share({
      title: 'Add me on BuffaGo',
      message: `Add me as a wing friend on BuffaGo: ${friendInviteUrl(qrCode)}`,
      url: friendInviteUrl(qrCode),
    });
  }, [qrCode]);

  const incoming = useMemo(() => invites.filter((row) => row.direction === 'incoming'), [invites]);
  const outgoing = useMemo(() => invites.filter((row) => row.direction === 'outgoing'), [invites]);

  const personRow = (row, actions, sourceSurface) => (
    <View key={`${sourceSurface}-${row.user_id}`} style={{ paddingVertical: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar.Text size={42} label={initials(displayName(row))} />
        <View style={{ flex: 1 }}>
          <Text variant="titleSmall" onPress={() => openProfile(row, sourceSurface)}>
            {displayName(row)}
          </Text>
          {row.recent_destination_name ? (
            <Text variant="bodySmall" style={{ opacity: 0.72 }}>
              Last rated {row.recent_destination_name}
              {row.recent_weight_score != null ? ` · ${Number(row.recent_weight_score).toFixed(1)}` : ''}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{actions}</View>
    </View>
  );

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button mode={tab === 'friends' ? 'contained' : 'outlined'} onPress={() => setTab('friends')} style={{ flex: 1 }}>
          Friends{activityBadge ? ` (${activityBadge})` : ''}
        </Button>
        <Button mode={tab === 'pending' ? 'contained' : 'outlined'} onPress={() => setTab('pending')} style={{ flex: 1 }}>
          Pending{pendingBadge ? ` (${pendingBadge})` : ''}
        </Button>
      </View>

      {error ? <Text style={{ color: theme.colors.error }}>{error}</Text> : null}

      {tab === 'friends' ? (
        <>
          <Searchbar
            placeholder="Search username, display name, or exact email"
            value={query}
            onChangeText={setQuery}
            loading={searching}
            autoCapitalize="none"
          />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button mode="contained-tonal" icon="qrcode" onPress={openQr} style={{ flex: 1 }}>
              My Friend QR
            </Button>
            <Button
              mode="outlined"
              icon="qrcode-scan"
              onPress={() => router.push('/friends/add')}
              style={{ flex: 1 }}
            >
              Enter Code
            </Button>
          </View>

          {query.trim().length >= 2 ? (
            <Card>
              <Card.Title title="Search results" />
              <Card.Content>
                {!searching && !results.length ? <Text>No eligible wing friends found.</Text> : null}
                {results.map((row, index) => (
                  <React.Fragment key={row.user_id}>
                    {personRow(
                      row,
                      row.relationship_status === 'none'
                        ? [
                            <Button
                              key="add"
                              mode="contained"
                              loading={busyId === row.user_id}
                              onPress={() => run(row.user_id, () => sendFriendRequest(row.user_id, 'search'))}
                            >
                              Add Friend
                            </Button>,
                          ]
                        : [
                            <Button key="status" mode="outlined" disabled>
                              {row.relationship_status === 'friends' ? 'Friends' : 'Request sent'}
                            </Button>,
                          ],
                      'search'
                    )}
                    {index < results.length - 1 ? <Divider /> : null}
                  </React.Fragment>
                ))}
              </Card.Content>
            </Card>
          ) : null}

          <Card>
            <Card.Title title="Wing Friends" />
            <Card.Content>
              {!loading && !friends.length ? (
                <Text>No wing friends yet. Add a friend to compare wing rankings.</Text>
              ) : null}
              {friends.map((row, index) => (
                <React.Fragment key={row.user_id}>
                  {personRow(
                    row,
                    [
                      <Button key="profile" mode="outlined" onPress={() => openProfile(row, 'friends')}>
                        View Profile
                      </Button>,
                      <Button
                        key="remove"
                        mode="text"
                        textColor={theme.colors.error}
                        onPress={() =>
                          Alert.alert('Remove friend?', `Remove ${displayName(row)} from your friends?`, [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: () => run(row.user_id, () => removeFriend(row.user_id)),
                            },
                          ])
                        }
                      >
                        Remove
                      </Button>,
                      <Button
                        key="block"
                        mode="text"
                        textColor={theme.colors.error}
                        onPress={() =>
                          Alert.alert(
                            'Block user?',
                            'This removes the friendship and hides both users from search, feeds, and profile interactions.',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Block',
                                style: 'destructive',
                                onPress: () => run(row.user_id, () => blockUser(row.user_id)),
                              },
                            ]
                          )
                        }
                      >
                        Block
                      </Button>,
                    ],
                    'friends'
                  )}
                  {index < friends.length - 1 ? <Divider /> : null}
                </React.Fragment>
              ))}
            </Card.Content>
          </Card>

          {blockedUsers.length ? (
            <Card>
              <Card.Title title="Blocked Users" />
              <Card.Content>
                {blockedUsers.map((row, index) => (
                  <React.Fragment key={row.user_id}>
                    {personRow(
                      row,
                      [
                        <Button key="unblock" mode="outlined" onPress={() => run(row.user_id, () => unblockUser(row.user_id))}>
                          Unblock
                        </Button>,
                      ],
                      'blocked_users'
                    )}
                    {index < blockedUsers.length - 1 ? <Divider /> : null}
                  </React.Fragment>
                ))}
              </Card.Content>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <Card.Title title="Pending Invites" />
          <Card.Content>
            {!loading && !invites.length ? <Text>No pending invites.</Text> : null}
            {incoming.length ? <Text variant="labelLarge">Incoming</Text> : null}
            {incoming.map((row) =>
              personRow(
                row,
                [
                  <Button key="accept" mode="contained" onPress={() => run(row.user_id, () => acceptFriendRequest(row.user_id))}>
                    Accept
                  </Button>,
                  <Button key="decline" mode="outlined" onPress={() => run(row.user_id, () => declineFriendRequest(row.user_id))}>
                    Decline
                  </Button>,
                ],
                'pending_invites'
              )
            )}
            {incoming.length && outgoing.length ? <Divider style={{ marginVertical: 10 }} /> : null}
            {outgoing.length ? <Text variant="labelLarge">Sent</Text> : null}
            {outgoing.map((row) =>
              personRow(
                row,
                [
                  <Button key="cancel" mode="outlined" onPress={() => run(row.user_id, () => cancelFriendRequest(row.user_id))}>
                    Cancel Request
                  </Button>,
                ],
                'pending_invites'
              )
            )}
          </Card.Content>
        </Card>
      )}

      <Button
        mode="text"
        loading={refreshing || loading}
        onPress={() => {
          setRefreshing(true);
          load();
        }}
      >
        Refresh friends
      </Button>

      <Portal>
        <Dialog visible={qrOpen} onDismiss={() => setQrOpen(false)}>
          <Dialog.Title>Your BuffaGo Friend Code</Dialog.Title>
          <Dialog.Content style={{ alignItems: 'center', gap: 16 }}>
            {qrCode ? (
              <View style={{ backgroundColor: '#fff', padding: 14, borderRadius: 16 }}>
                <QRCode value={friendInviteUrl(qrCode)} size={220} />
              </View>
            ) : null}
            <Text style={{ textAlign: 'center' }}>
              A friend can scan this with their phone camera. The code contains only a revocable invite ID.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={shareQr}>Share</Button>
            <Button onPress={() => setQrOpen(false)}>Done</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
