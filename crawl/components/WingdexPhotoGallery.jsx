import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { ActivityIndicator, Button, Dialog, Portal, Text } from 'react-native-paper';
import { loadWingdexFullPhoto, loadWingdexRestaurantGallery, orderWingdexPhotos } from '../lib/wingdexGallery';
import { supabase } from '../lib/supabase';
import WingdexPhotoViewer from './WingdexPhotoViewer';
import PhotoVoteControls from './PhotoVoteControls';
import { subscribePhotoVotes } from '../lib/photoVoteEvents';
import { createVoteController, loadOwnPhotoVotes } from '../lib/wingdexPhotos';
import { useAuth } from '../providers/AuthProvider';

export default function WingdexPhotoGallery({ restaurant, onClose, onPhotoChange, embedded = false, compact = false }) {
  const { user } = useAuth();
  const generation = useRef(0);
  const inFlight = useRef(false);
  const active = useRef(true);
  const accountRef = useRef(user?.id);
  accountRef.current = user?.id;
  const busyRef = useRef({});
  const voteVersions = useRef({});
  const vote = useMemo(() => createVoteController(supabase), []);
  const isVotePending = useCallback((id) => Boolean(busyRef.current[id]), []);
  const getVoteVersion = useCallback((id) => voteVersions.current[id], []);
  const [selectedId, setSelectedId] = useState(null);
  const selectedIdRef = useRef(null);
  selectedIdRef.current = selectedId;
  const [votesReady, setVotesReady] = useState(false);
  const [busy, setBusy] = useState({});
  const [voteError, setVoteError] = useState(null);
  const [voteReload, setVoteReload] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [brokenImages, setBrokenImages] = useState({});
  const [state, setState] = useState({ images: [], count: 0, offset: 0, loading: true, error: null });
  const [stripWidth, setStripWidth] = useState(240);
  const [stripIndex, setStripIndex] = useState(0);
  const stripList = useRef(null);
  const stripPosition = useRef({ id: null, index: 0, width: 240 });
  const orderedImages = useMemo(() => orderWingdexPhotos(state.images), [state.images]);
  useEffect(() => {
    if (!orderedImages.length) return;
    const previous = stripPosition.current;
    const found = orderedImages.findIndex((image) => image.submission_id === previous.id);
    const index = found >= 0 ? found : Math.min(previous.index, orderedImages.length - 1);
    const width = compact ? stripWidth : 248;
    if (index !== previous.index || width !== previous.width) {
      stripList.current?.scrollToOffset({ offset: index * width, animated: false });
      setStripIndex(index);
    }
    stripPosition.current = { id: orderedImages[index].submission_id, index, width };
  }, [orderedImages, compact, stripWidth]);
  useEffect(() => subscribePhotoVotes(({ userId, photo }) => {
    if (userId !== accountRef.current) return;
    voteVersions.current[photo.submission_id] = (voteVersions.current[photo.submission_id] || 0) + 1;
    setState((old) => ({ ...old, images: old.images.map((image) => image.submission_id === photo.submission_id
      ? { ...image, ...photo, signed_url: image.signed_url } : image) }));
  }), []);
  const stateRef = useRef(state);
  stateRef.current = state;
  const load = useCallback(async (offset = 0) => {
    if (!restaurant?.destination_id || inFlight.current) return;
    const request = ++generation.current;
    inFlight.current = true;
    setState((old) => ({ ...old, loading: true, error: null, ...(offset === 0 ? { offset: 0 } : {}) }));
    try {
      const result = await loadWingdexRestaurantGallery(restaurant.destination_id, supabase, { offset });
      if (request !== generation.current) return;
      setState((old) => {
        const previous = offset ? old.images : [];
        const seen = new Set(previous.map((image) => image.submission_id));
        const ownVotes = new Map(old.images.map((image) => [image.submission_id, image.current_vote ?? null]));
        return { images: [...previous, ...result.images.filter((image) => !seen.has(image.submission_id))
          .map((image) => ({ ...image, current_vote: ownVotes.get(image.submission_id) ?? null }))],
          count: result.count, offset: offset + 60, loading: false, error: null };
      });
      if (offset === 0) setBrokenImages({});
    } catch {
      if (request === generation.current) setState((old) => ({ ...old, loading: false, error: 'Pictures are temporarily unavailable.' }));
    } finally { if (request === generation.current) inFlight.current = false; }
  }, [restaurant?.destination_id]);
  useEffect(() => {
    inFlight.current = false;
    setSelectedId(null);
    stripPosition.current = { ...stripPosition.current, id: null, index: 0 };
    setStripIndex(0);
    setBrokenImages({});
    setState({ images: [], count: 0, offset: 0, loading: true, error: null });
    void load();
    return () => { generation.current += 1; };
  }, [load]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    busyRef.current = {};
    setBusy({});
    setState((old) => ({ ...old, images: old.images.map((image) => ({ ...image, current_vote: null })) }));
  }, [user?.id]);
  const photoIds = state.images.map((image) => image.submission_id).join(',');
  useEffect(() => {
    let alive = true;
    const versions = { ...voteVersions.current };
    setVotesReady(false);
    loadOwnPhotoVotes(state.images, supabase).then((photos) => {
      if (!alive) return;
      const ownVotes = new Map(photos.map((photo) => [photo.submission_id, photo.current_vote]));
      setState((old) => ({ ...old, images: old.images.map((image) => busyRef.current[image.submission_id]
        || voteVersions.current[image.submission_id] !== versions[image.submission_id]
        ? image : { ...image, current_vote: ownVotes.get(image.submission_id) ?? null }) }));
      setVotesReady(true);
      setVoteError(null);
    }).catch(() => { if (alive) setVoteError('Could not load your votes. Please retry.'); });
    return () => { alive = false; };
    // Counts changing after a vote should not reset the current selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, photoIds, voteReload]);
  useEffect(() => {
    const refresh = async () => {
      if (selectedIdRef.current || inFlight.current || !restaurant?.destination_id) return;
      const request = ++generation.current;
      inFlight.current = true;
      const versions = { ...voteVersions.current };
      try {
        const pages = Math.max(1, Math.ceil(stateRef.current.offset / 60));
        const refreshed = [];
        let count = 0;
        for (let page = 0; page < pages; page += 1) {
          const result = await loadWingdexRestaurantGallery(restaurant.destination_id, supabase, { offset: page * 60 });
          count = result.count;
          refreshed.push(...result.images);
          if (refreshed.length >= count) break;
        }
        if (request !== generation.current) return;
        const byId = new Map(refreshed.map((image) => [image.submission_id, image]));
        setState((old) => {
          const existing = new Set(old.images.map((image) => image.submission_id));
          return { ...old, count, error: null, images: [
            ...old.images.filter((image) => byId.has(image.submission_id))
              .map((image) => ({ ...image, ...byId.get(image.submission_id),
                ...(busyRef.current[image.submission_id] || voteVersions.current[image.submission_id] !== versions[image.submission_id]
                  ? { like_count: image.like_count, dislike_count: image.dislike_count, neutral_count: image.neutral_count } : {}),
                current_vote: image.current_vote })),
            ...refreshed.filter((image) => !existing.has(image.submission_id)),
          ] };
        });
        setBrokenImages({});
      } catch {
        if (request === generation.current) setState((old) => ({ ...old, error: 'Pictures are temporarily unavailable.' }));
      } finally { if (request === generation.current) inFlight.current = false; }
    };
    const timer = setInterval(refresh, 240000);
    const subscription = AppState.addEventListener('change', (next) => { if (next === 'active') refresh(); });
    if (refreshToken) void refresh();
    return () => { clearInterval(timer); subscription.remove(); };
  }, [restaurant?.destination_id, refreshToken]);
  const cast = async (photo, choice) => {
    if (!votesReady || busyRef.current[photo.submission_id]) return;
    if (!user || user.is_anonymous) { setVoteError('Sign in to vote on photos.'); return; }
    const account = user.id;
    setVoteError(null);
    try {
      const saved = await vote(photo, choice, (updated, pending) => {
        if (!active.current) return;
        if (accountRef.current !== account) { void load(); return; }
        busyRef.current[updated.submission_id] = pending;
        if (pending) voteVersions.current[updated.submission_id] = (voteVersions.current[updated.submission_id] || 0) + 1;
        setState((old) => ({ ...old, images: old.images.map((image) => image.submission_id === updated.submission_id
          ? { ...updated, signed_url: image.signed_url } : image) }));
        setBusy((old) => ({ ...old, [updated.submission_id]: pending }));
        if (!pending) onPhotoChange?.(updated);
      }, account);
      if (!saved) return;
      const version = voteVersions.current[photo.submission_id];
      const refreshed = await loadWingdexFullPhoto(photo, supabase);
      if (active.current && accountRef.current === account && !busyRef.current[photo.submission_id]
        && version === voteVersions.current[photo.submission_id]) {
        setState((old) => ({ ...old, images: old.images.map((image) => image.submission_id === refreshed.submission_id
          ? { ...image, like_count: refreshed.like_count, dislike_count: refreshed.dislike_count, neutral_count: refreshed.neutral_count } : image) }));
        onPhotoChange?.(refreshed);
      }
    } catch (error) { if (active.current && accountRef.current === account) setVoteError(error.message); }
  };
  const Container = embedded ? View : Dialog;
  const Content = embedded ? View : Dialog.Content;
  const Actions = embedded ? View : Dialog.Actions;
  const gallery = <Container {...(embedded ? { testID: 'restaurant-wing-shots' } : {
    visible: Boolean(restaurant), onDismiss: onClose, style: { borderRadius: 24 },
  })}>
    {compact ? null : embedded ? <Text variant="titleMedium" style={{ marginBottom: 8 }}>Wing Shots</Text>
      : <Dialog.Title>{restaurant?.name || 'Pictures'}</Dialog.Title>}
    <Content>
      {state.error ? <View><Text>{state.error}</Text><Button onPress={() => void load()}>Retry pictures</Button></View> : null}
      {voteError ? <View><Text accessibilityRole="alert">{voteError}</Text>
        {votesReady ? null : <Button onPress={() => setVoteReload((n) => n + 1)}>Retry votes</Button>}</View> : null}
      {state.loading ? <ActivityIndicator /> : null}
      {!state.loading && !state.error && !state.images.length ? <View style={{ alignItems: 'center', paddingVertical: embedded ? 12 : 24 }}>
        {embedded ? <Text>No approved Wing Shots yet.</Text> : <Text variant="titleMedium">BUFFAGO</Text>}
        <Text>Be the first to add a photo</Text></View> : null}
      <View onLayout={(event) => { if (compact && event.nativeEvent.layout.width > 0) setStripWidth(event.nativeEvent.layout.width); }}>
      {state.count > 1 ? <Text testID="wingdex-photo-counter" style={{ textAlign: 'right', fontSize: 12, marginBottom: 4 }}>{Math.min(stripIndex + 1, state.count)} of {state.count}</Text> : null}
      <FlatList ref={stripList} horizontal directionalLockEnabled nestedScrollEnabled
        snapToInterval={compact ? stripWidth : 248} decelerationRate="fast" showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const index = Math.max(0, Math.min(orderedImages.length - 1, Math.round(event.nativeEvent.contentOffset.x / (compact ? stripWidth : 248))));
          stripPosition.current = { id: orderedImages[index]?.submission_id, index, width: compact ? stripWidth : 248 };
          setStripIndex(index);
        }}
        onEndReached={() => { if (state.offset < state.count && !state.loading) void load(state.offset); }} onEndReachedThreshold={0.5}
        style={{ flexGrow: 0 }} data={orderedImages}
        keyExtractor={(image) => image.submission_id} initialNumToRender={3} maxToRenderPerBatch={5}
        windowSize={5} getItemLayout={(_, index) => ({ length: compact ? stripWidth : 248, offset: (compact ? stripWidth : 248) * index, index })}
        renderItem={({ item: image }) => <View style={{ width: compact ? stripWidth : 240, marginRight: compact ? 0 : 8 }}>
          {brokenImages[image.submission_id] ? <View style={{ width: compact ? stripWidth : 240, height: compact ? stripWidth * 9 / 16 : 240, justifyContent: 'center', alignItems: 'center' }}>
            <Text>Photo unavailable</Text><Button onPress={() => void load()}>Retry photo</Button>
          </View> : <Pressable accessibilityRole="button" accessibilityLabel="Open approved restaurant photo"
            onPress={(event) => { event?.stopPropagation?.(); setSelectedId(image.submission_id); }}>
            <Image source={{ uri: image.signed_url }} contentFit="cover" style={{ width: compact ? stripWidth : 240, height: compact ? stripWidth * 9 / 16 : 240, borderRadius: 12 }} accessibilityLabel="Approved restaurant picture"
              onError={() => {
                if (active.current && stateRef.current.images.some((current) => current.submission_id === image.submission_id
                  && current.signed_url === image.signed_url)) {
                  setBrokenImages((old) => ({ ...old, [image.submission_id]: true }));
                }
              }} />
          </Pressable>}
          <PhotoVoteControls photo={image} testPrefix={`photo-preview-${image.submission_id}`}
            disabled={!votesReady || busy[image.submission_id]} onVote={(choice) => void cast(image, choice)} />
        </View>} />
      </View>
    </Content>
    <Actions>
      {state.offset < state.count ? <Button disabled={state.loading} onPress={() => void load(state.offset)}>More pictures</Button> : null}
      {embedded ? null : <Button contentStyle={{ minHeight: 44 }} onPress={onClose}>Close</Button>}
    </Actions>
  </Container>;
  return <>{embedded ? gallery : <Portal>{gallery}</Portal>}{selectedId ? <Portal><WingdexPhotoViewer photos={orderedImages} selectedId={selectedId} restaurantName={restaurant.name}
    voteController={vote} isVotePending={isVotePending} getVoteVersion={getVoteVersion} parentVotesReady={votesReady}
    onClose={() => { setSelectedId(null); setRefreshToken((n) => n + 1); }}
    totalCount={state.count} hasMore={state.offset < state.count} onMore={() => void load(state.offset)}
    pageError={state.error} pageLoading={state.loading}
    onPhotoChange={(updated, pending) => {
      if (!active.current) return;
      if (accountRef.current !== user?.id) { void load(); return; }
      busyRef.current[updated.submission_id] = Boolean(pending);
      if (pending) voteVersions.current[updated.submission_id] = (voteVersions.current[updated.submission_id] || 0) + 1;
      setBusy((old) => ({ ...old, [updated.submission_id]: Boolean(pending) }));
      setState((old) => ({ ...old, images: old.images.map((p) => p.submission_id === updated.submission_id ? { ...p, ...updated, signed_url: p.signed_url } : p) }));
      if (!pending) onPhotoChange?.(updated);
    }} /></Portal> : null}</>;
}
