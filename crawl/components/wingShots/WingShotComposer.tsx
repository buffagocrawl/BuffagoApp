import { isWingShotDestinationId } from '../../lib/wingShotAuthIntent';
import { trackEvent } from '../../lib/analytics';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { WingShotFlow } from './WingShotFlow';
import { supabase } from '../../lib/supabase';

type Source = 'onboarding' | 'buffacoin' | 'profile' | 'home_cta';
type Restaurant = { id: string; name: string | null; city: string | null };

export function WingShotComposer({ source, onClose, destinationId, restaurantName, userId, onDestinationResolved }: { source: Source; onClose: () => void; destinationId?: string; restaurantName?: string; userId?: string; onDestinationResolved?: () => void | Promise<void> }) {
  const [query, setQuery] = useState((restaurantName || '').slice(0, 120));
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [resolving, setResolving] = useState(Boolean(destinationId));
  useEffect(() => {
    let active = true;
    setSelected(null);
    if (!isWingShotDestinationId(destinationId)) {
      setResolving(false);
      if (destinationId) setNotice('Choose an available restaurant below.');
      void Promise.resolve(onDestinationResolved?.()).catch(() => {});
      return;
    }
    setResolving(true);
    Promise.resolve(supabase.from('destinations').select('id,name,city').eq('id', destinationId).maybeSingle()).then(({ data, error }) => {
      if (!active) return;
      if (!error && data && isWingShotDestinationId(data.id)) {
        setSelected(data);
        void trackEvent({ eventName: 'wing_shot_restaurant_preselected', screen: 'profile/wing-shots/submit', destinationId: data.id, metadata: { source } }).catch(() => {});
      } else setNotice('This restaurant could not be opened. Choose an available restaurant below.');
      if (!error) void Promise.resolve(onDestinationResolved?.()).catch(() => {});
      setResolving(false);
    }).catch(() => { if (active) { setNotice('Restaurant lookup failed. Search again or explore.'); setResolving(false); } });
    return () => { active = false; };
    // Resolution belongs to this destination, not a parent callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationId, source]);
  const search = useCallback(async (value: string) => {
    setLoading(true);
    const normalized = value.trim();
    let request = supabase.from('destinations').select('id,name,city').order('name').limit(20);
    if (normalized) request = request.ilike('name', `%${normalized.replace(/[%_\\]/g, '').slice(0, 100)}%`);
    const { data, error } = await request;
    if (error) throw error;
    setRestaurants((data ?? []).filter((row) => isWingShotDestinationId(row.id)) as Restaurant[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (!resolving && !selected) void search(query).catch(() => { setLoading(false); setNotice('Search is unavailable. Retry or explore.'); }); }, [query, search, resolving, selected]);

  if (resolving) return <View style={styles.picker}><Text>Opening restaurant...</Text><Pressable onPress={onClose} style={styles.cancel}><Text>Explore BuffaGo</Text></Pressable></View>;
  if (!selected) {
    return (
      <View style={styles.picker} testID={`wing-shot-picker-${source}`}>
        {!!notice && <Text accessibilityRole="alert">{notice}</Text>}
        <Text style={styles.title}>Where were these wings from?</Text>
        <Text style={styles.copy}>Choose the restaurant associated with your photo. You do not need to be there now.</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search restaurants" style={styles.input} testID="wing-shot.restaurant-search" />
        {loading ? <Text>Searching…</Text> : null}
        <FlatList ListEmptyComponent={!loading ? <Text>No matching restaurants. Try another name.</Text> : null} data={restaurants} keyExtractor={(item) => item.id} renderItem={({ item }) => (
          <Pressable onPress={() => { setSelected(item); setEditing(false); }} style={styles.result} testID={`wing-shot.restaurant-${item.id}`}>
            <Text style={styles.resultName}>{item.name || 'Restaurant'}</Text>
            {item.city ? <Text>{item.city}</Text> : null}
          </Pressable>
        )} />
        <Pressable onPress={onClose} style={styles.cancel}><Text>Not now</Text></Pressable>
      </View>
    );
  }
  return <View style={{ flex: 1 }}><Text style={styles.resultName}>{selected.name || 'Restaurant'}</Text><WingShotFlow key={selected.id} visible={!editing} destinationId={selected.id} submissionSource={source} destinationName={selected.name || 'Restaurant'} onChangeRestaurant={() => { setSelected(null); setEditing(true); }} analyticsContext={{ screen: 'profile/wing-shots/submit', destinationId: selected.id, userId }} onClose={onClose} /></View>;
}

const styles = StyleSheet.create({
  picker: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  copy: { lineHeight: 20, marginBottom: 18 },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 10, padding: 14, marginBottom: 12 },
  result: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  resultName: { fontWeight: '700' },
  cancel: { padding: 16, alignItems: 'center' },
});
