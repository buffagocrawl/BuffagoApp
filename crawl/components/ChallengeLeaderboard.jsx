import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Avatar, Button, Card, Divider, Text, ActivityIndicator, useTheme } from 'react-native-paper';
import { loadChallengeLeaderboard, challengeLabel } from '../lib/challengeStats';
import { trackEvent } from '../lib/analytics';

const initials = (name) => String(name || 'W').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();

export default function ChallengeLeaderboard({ client, onUserPress, onSignIn }) {
  const theme = useTheme();
  const [period, setPeriod] = useState('week');
  const [authenticated, setAuthenticated] = useState(null);
  const [state, setState] = useState({ loading: true, error: false, rows: [] });
  const load = useCallback(async () => {
    setState((old) => ({ ...old, loading: true, error: false }));
    try { setState({ loading: false, error: false, rows: await loadChallengeLeaderboard(client, period) }); }
    catch { setState({ loading: false, error: true, rows: [] }); }
  }, [client, period]);
  useEffect(() => { let live = true; client.auth.getSession().then(({ data }) => { if (live) setAuthenticated(Boolean(data?.session?.user?.id)); }).catch(() => { if (live) setAuthenticated(false); }); return () => { live = false; }; }, [client]);
  useEffect(() => { if (authenticated) load(); }, [authenticated, load]);
  useEffect(() => { if (authenticated) trackEvent({ eventName: 'challenge_leaderboard_viewed', screen: 'leaderboards', metadata: { period } }); }, [authenticated, period]);
  const changePeriod = (next) => { setPeriod(next); trackEvent({ eventName: 'challenge_leaderboard_period_changed', screen: 'leaderboards', metadata: { period: next } }); };
  const current = state.rows.find((x) => x.isCurrentUser);
  return <Card style={styles.card} testID="challenge-leaderboard"><Card.Content>
    <Text variant="titleLarge" style={styles.title}>Challenges</Text>
    <View style={styles.controls}><Button compact mode={period === 'week' ? 'contained' : 'outlined'} onPress={() => changePeriod('week')}>This Week</Button><Button compact mode={period === 'all_time' ? 'contained' : 'outlined'} onPress={() => changePeriod('all_time')}>All Time</Button></View>
    {authenticated === null ? <View style={styles.state}><ActivityIndicator /><Text>Loading challenge rankings…</Text></View> : !authenticated ? <View style={styles.state}><Text>Sign in to see your challenge rank.</Text><Button onPress={onSignIn}>Sign in</Button></View> : state.loading ? <View style={styles.state}><ActivityIndicator /><Text>Loading challenge rankings…</Text></View> : state.error ? <View style={styles.state}><Text>Challenge rankings couldn’t load.</Text><Button onPress={load}>Try again</Button></View> : state.rows.length === 0 ? <View style={styles.state}><Text>{period === 'week' ? 'No verified challenge completions this week yet.' : 'No verified challenge completions yet.'}</Text></View> : <View>{state.rows.filter((x) => !x.isCurrentUser || x.rank <= 25).map((row) => <React.Fragment key={row.userId}><Button mode="text" contentStyle={styles.row} onPress={() => onUserPress?.(row.userId)}><Text style={styles.rank}>{row.rank}.</Text>{row.avatarUrl ? <Avatar.Image size={32} source={{ uri: row.avatarUrl }} /> : <Avatar.Text size={32} label={initials(row.username)} />}<View style={styles.name}><Text numberOfLines={1}>{row.username}</Text><Text variant="bodySmall">{challengeLabel(row.completions)} · {row.xp} XP</Text></View></Button><Divider /></React.Fragment>)}</View>}
    {current && current.rank > 25 ? <View style={[styles.current, { borderColor: theme.colors.primary }]}><Text>Your rank: #{current.rank} · {challengeLabel(current.completions)} · {current.xp} XP</Text></View> : null}
  </Card.Content></Card>;
}
const styles = StyleSheet.create({ card:{ marginBottom:16 }, title:{ fontWeight:'800' }, controls:{ flexDirection:'row', gap:8, marginVertical:12 }, state:{ alignItems:'center', gap:8, paddingVertical:18 }, row:{ justifyContent:'flex-start', gap:10, width:'100%' }, rank:{ minWidth:28, fontWeight:'800' }, name:{ flex:1, alignItems:'flex-start', minWidth:0 }, current:{ marginTop:12, padding:10, borderWidth:1, borderRadius:10 } });
