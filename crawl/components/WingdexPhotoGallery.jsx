import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { ActivityIndicator, Button, Dialog, Portal, Text } from 'react-native-paper';
import { loadWingdexRestaurantGallery } from '../lib/wingdexGallery';
import { supabase } from '../lib/supabase';

export default function WingdexPhotoGallery({ restaurant, onClose }) {
  const generation = useRef(0);
  const inFlight = useRef(false);
  const [state, setState] = useState({ images: [], count: 0, offset: 0, loading: true, error: null });
  const load = useCallback(async (offset = 0) => {
    if (!restaurant?.destination_id || inFlight.current) return;
    const request = ++generation.current;
    inFlight.current = true;
    setState((old) => ({ ...old, loading: true, error: null, ...(offset === 0 ? { images: [], offset: 0 } : {}) }));
    try {
      const result = await loadWingdexRestaurantGallery(restaurant.destination_id, supabase, { offset });
      if (request !== generation.current) return;
      setState((old) => {
        const previous = offset ? old.images : [];
        const seen = new Set(previous.map((image) => image.submission_id));
        return { images: [...previous, ...result.images.filter((image) => !seen.has(image.submission_id))],
          count: result.count, offset: offset + 60, loading: false, error: null };
      });
    } catch {
      if (request === generation.current) setState((old) => ({ ...old, loading: false, error: 'Pictures are temporarily unavailable.' }));
    } finally { if (request === generation.current) inFlight.current = false; }
  }, [restaurant?.destination_id]);
  useEffect(() => {
    inFlight.current = false;
    setState({ images: [], count: 0, offset: 0, loading: true, error: null });
    void load();
    return () => { generation.current += 1; };
  }, [load]);
  return <Portal><Dialog visible={Boolean(restaurant)} onDismiss={onClose}>
    <Dialog.Title>{restaurant?.name || 'Pictures'}</Dialog.Title>
    <Dialog.Content>
      {state.error ? <View><Text>{state.error}</Text><Button onPress={() => void load()}>Retry pictures</Button></View> : null}
      {state.loading ? <ActivityIndicator /> : null}
      {!state.loading && !state.error && !state.images.length ? <Text>No approved pictures yet.</Text> : null}
      <ScrollView horizontal style={{ maxHeight: 300 }}>
        {state.images.map((image) => <Image key={image.submission_id} source={{ uri: image.signed_url }}
          contentFit="contain" style={{ width: 280, height: 280 }} accessibilityLabel="Approved restaurant picture"
          onError={() => setState((old) => ({ ...old, error: 'A picture could not load. Refresh the gallery to try again.' }))} />)}
      </ScrollView>
    </Dialog.Content>
    <Dialog.Actions>
      {state.offset < state.count ? <Button disabled={state.loading} onPress={() => void load(state.offset)}>More pictures</Button> : null}
      <Button onPress={onClose}>Close</Button>
    </Dialog.Actions>
  </Dialog></Portal>;
}
