import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { WingShotFlow } from './WingShotFlow';
import { supabase } from '../../lib/supabase';

type Source = 'onboarding' | 'buffacoin' | 'profile' | 'home_cta';
type Restaurant = { id: string; name: string | null; city: string | null };

export function WingShotComposer({ source, onClose }: { source: Source; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (value: string) => {
    setLoading(true);
    const normalized = value.trim();
    let request = supabase.from('destinations').select('id,name,city').order('name').limit(20);
    if (normalized) request = request.ilike('name', `%${normalized}%`);
    const { data } = await request;
    setRestaurants((data ?? []) as Restaurant[]);
    setLoading(false);
  }, []);

  useEffect(() => { search(query); }, [query, search]);

  if (!selected) {
    return (
      <View style={styles.picker} testID={`wing-shot-picker-${source}`}>
        <Text style={styles.title}>Where were these wings from?</Text>
        <Text style={styles.copy}>Choose the restaurant associated with your photo. You do not need to be there now.</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search restaurants" style={styles.input} testID="wing-shot.restaurant-search" />
        {loading ? <Text>Searching…</Text> : null}
        <FlatList data={restaurants} keyExtractor={(item) => item.id} renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={styles.result} testID={`wing-shot.restaurant-${item.id}`}>
            <Text style={styles.resultName}>{item.name || 'Restaurant'}</Text>
            {item.city ? <Text>{item.city}</Text> : null}
          </Pressable>
        )} />
        <Pressable onPress={onClose} style={styles.cancel}><Text>Not now</Text></Pressable>
      </View>
    );
  }
  return <WingShotFlow visible destinationId={selected.id} submissionSource={source} onClose={onClose} />;
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
