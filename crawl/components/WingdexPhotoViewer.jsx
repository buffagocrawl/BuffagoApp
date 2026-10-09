import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { ActivityIndicator, Button, IconButton, Text } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ResumableZoom } from 'react-native-zoom-toolkit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../providers/AuthProvider';
import { createVoteController, loadOwnPhotoVotes } from '../lib/wingdexPhotos';
import { loadWingdexFullPhoto } from '../lib/wingdexGallery';
import { supabase } from '../lib/supabase';

export default function WingdexPhotoViewer({ photos, selectedId, restaurantName, onClose, onPhotoChange, onMore, hasMore, totalCount, pageError, pageLoading, voteController, isVotePending, getVoteVersion, parentVotesReady }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState(photos);
  const [index, setIndex] = useState(Math.max(0, photos.findIndex((p) => p.submission_id === selectedId)));
  const [asset, setAsset] = useState(null);
  const [error, setError] = useState(null);
  const [ownVotesReady, setOwnVotesReady] = useState(false);
  const [busy, setBusy] = useState({});
  const [reload, setReload] = useState(0);
  const [voteReload, setVoteReload] = useState(0);
  const [box, setBox] = useState({ width: 1, height: 1 });
  const [resolution, setResolution] = useState(null);
  const [imageLoading, setImageLoading] = useState(true);
  const zoom = useRef(null);
  const panScale = useRef(1);
  const pendingNext = useRef(null);
  const active = useRef(true);
  const accountRef = useRef(user?.id);
  accountRef.current = user?.id;
  const busyRef = useRef({});
  const voteVersions = useRef({});
  const vote = useMemo(() => voteController || createVoteController(supabase), [voteController]);
  const votesReady = voteController ? Boolean(parentVotesReady) : ownVotesReady;
  const photo = items[index];
  const photoRef = useRef(photo?.submission_id);
  photoRef.current = photo?.submission_id;
  const displayedAsset = asset?.submission_id === photo?.submission_id ? asset : null;
  const assetRef = useRef(displayedAsset);
  assetRef.current = displayedAsset;
  const photoIds = photos.map((p) => p.submission_id).join(',');
  useEffect(() => {
    busyRef.current = {}; setBusy({});
    setItems((old) => old.map((p) => ({ ...p, current_vote: null })));
  }, [user?.id]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    // The gallery owns votes and counts. Keep the open viewer in sync with it,
    // while preserving a vote that this viewer is still saving.
    setItems((old) => {
      const incoming = new Map(photos.map((p) => [p.submission_id, p]));
      const existing = new Set(old.map((p) => p.submission_id));
      return [...old.filter((p) => incoming.has(p.submission_id))
        .map((p) => busyRef.current[p.submission_id] ? p : { ...p, ...incoming.get(p.submission_id) }),
        ...photos.filter((p) => !existing.has(p.submission_id))];
    });
  }, [photos]);
  useEffect(() => {
    if (photo && !photos.some((p) => p.submission_id === photo.submission_id)) onClose();
  }, [photos, photo, onClose]);
  useEffect(() => {
    if (pendingNext.current !== null && pendingNext.current < items.length) {
      setIndex(pendingNext.current); pendingNext.current = null;
      zoom.current?.reset(false);
    }
  }, [items.length]);
  useEffect(() => {
    if (voteController) return;
    let alive = true;
    setOwnVotesReady(false);
    loadOwnPhotoVotes(photos, supabase).then((loaded) => {
      if (!alive) return;
      const votes = new Map(loaded.map((p) => [p.submission_id, p.current_vote]));
      setItems((old) => old.map((p) => busyRef.current[p.submission_id] || isVotePending?.(p.submission_id)
        ? p : { ...p, current_vote: votes.get(p.submission_id) ?? null }));
      setOwnVotesReady(true);
    }).catch(() => { if (alive) setError('Could not load your votes. Please retry.'); });
    return () => { alive = false; };
    // Only new IDs require a vote read; parent count updates preserve selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, photoIds, voteReload, isVotePending, voteController]);
  useEffect(() => {
    let alive = true;
    let timer;
    const version = voteVersions.current[photo?.submission_id];
    const parentVersion = getVoteVersion?.(photo?.submission_id);
    setAsset(null); setResolution(null); setError(null); setImageLoading(true);
    zoom.current?.reset(false);
    if (photo) loadWingdexFullPhoto(photo, supabase).then((loaded) => {
      if (!alive) return;
      setAsset(loaded);
      // The gallery versions every mutation, including votes begun in the preview.
      // Publish fresh totals only if that shared state has not changed mid-request.
      if (voteController && getVoteVersion && !isVotePending?.(loaded.submission_id)
        && getVoteVersion(loaded.submission_id) === parentVersion) {
        onPhotoChange?.({ submission_id: loaded.submission_id,
          like_count: loaded.like_count, dislike_count: loaded.dislike_count }, false);
      }
      setItems((old) => old.map((p) => !voteController && p.submission_id === loaded.submission_id && !busyRef.current[p.submission_id]
        && voteVersions.current[p.submission_id] === version
        ? { ...p, like_count: loaded.like_count, dislike_count: loaded.dislike_count } : p));
      timer = setTimeout(() => { if (alive) setReload((n) => n + 1); }, 240000);
    }).catch((e) => { if (alive) setError(e.message); });
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') setReload((n) => n + 1); });
    return () => { alive = false; clearTimeout(timer); subscription.remove(); };
    // Counts and votes must not reload an image or reset zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.submission_id, reload]);
  const navigate = useCallback((next) => {
    if (next < 0) return;
    if (next >= items.length) { if (hasMore) { pendingNext.current = next; onMore?.(); } return; }
    pendingNext.current = null;
    zoom.current?.reset(false); panScale.current = 1;
    setIndex(next); setError(null);
  }, [items.length, hasMore, onMore]);
  const cast = async (choice) => {
    if (!photo || busyRef.current[photo.submission_id] || isVotePending?.(photo.submission_id) || !votesReady) return;
    if (!user || user.is_anonymous) { setError('Sign in to vote on photos.'); return; }
    const account = user.id;
    setError(null);
    try {
      const saved = await vote(photo, choice, (updated, pending) => {
        if (accountRef.current !== account) return;
        busyRef.current[updated.submission_id] = pending;
        if (pending) voteVersions.current[updated.submission_id] = (voteVersions.current[updated.submission_id] || 0) + 1;
        if (active.current) {
          setItems((old) => old.map((p) => p.submission_id === updated.submission_id ? updated : p));
          setBusy((old) => ({ ...old, [updated.submission_id]: pending }));
        }
        if (voteController || !pending) onPhotoChange?.(updated, pending);
      }, account);
      if (!saved) return;
      const version = voteVersions.current[photo.submission_id];
      // Reconcile aggregate totals with database triggers, including other voters.
      const updated = await loadWingdexFullPhoto(photo, supabase);
      if (accountRef.current === account && !busyRef.current[photo.submission_id]
        && version === voteVersions.current[photo.submission_id]) {
        if (active.current) setItems((old) => old.map((p) => p.submission_id === updated.submission_id
          ? { ...p, like_count: updated.like_count, dislike_count: updated.dislike_count } : p));
        onPhotoChange?.(updated, false);
      }
    } catch (e) { if (active.current && account === accountRef.current) setError(e.message); }
  };
  const ratio = resolution ? resolution.width / resolution.height : box.width / box.height;
  const imageWidth = Math.min(box.width, box.height * ratio);
  const imageHeight = imageWidth / ratio;
  const visibleError = error || pageError || (!photo ? 'No photos available.' : null);
  return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
    <GestureHandlerRootView style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}><Text style={styles.title} numberOfLines={1}>{restaurantName}</Text>
          <Text style={styles.muted}>{photo ? index + 1 : 0} of {totalCount ?? items.length}</Text></View>
        <IconButton testID="photo-viewer-close" icon="close" iconColor="#fff" style={{ width: 44, height: 44 }} accessibilityLabel="Close photo" onPress={onClose} />
      </View>
      <View style={styles.stage} onLayout={(e) => setBox(e.nativeEvent.layout)}>
        {displayedAsset ? <ResumableZoom key={photo.submission_id} ref={zoom} style={{ flex: 1 }} minScale={1} maxScale={4}
          scaleMode="clamp" panMode="clamp" extendGestures
          onPanStart={() => { panScale.current = zoom.current?.getState().scale ?? 1; }}
          onPanEnd={(e) => {
            if (panScale.current > 1.01 || (zoom.current?.getState().scale ?? 1) > 1.01) return;
            if (Math.abs(e.translationX) > 60 && Math.abs(e.translationX) > Math.abs(e.translationY) * 1.5)
              navigate(index + (e.translationX < 0 ? 1 : -1));
          }}>
          <Image testID="photo-viewer-image" source={{ uri: displayedAsset.signed_url }} contentFit="contain"
            accessibilityLabel={`Photo ${index + 1} of ${restaurantName}`} style={{ width: imageWidth, height: imageHeight }}
            onLoad={(e) => {
              if (active.current && photoRef.current === displayedAsset.submission_id && assetRef.current === displayedAsset) {
                setImageLoading(false);
                if (e.source.width > 0 && e.source.height > 0)
                  setResolution({ width: e.source.width, height: e.source.height });
              }
            }}
            onError={() => {
              if (active.current && photoRef.current === displayedAsset.submission_id && assetRef.current === displayedAsset) {
                setImageLoading(false); setAsset(null); setError('Photo could not load. Check your connection and retry.');
              }
            }} />
        </ResumableZoom> : visibleError ? null : <ActivityIndicator color="#fff" />}
        {displayedAsset && imageLoading ? <ActivityIndicator style={styles.imageLoading} color="#fff" accessibilityLabel="Loading photo" /> : null}
      </View>
      <View style={styles.footer}>
        {visibleError ? <View style={styles.message}><Text accessibilityRole="alert" style={styles.muted}>{visibleError}</Text>
          <Button textColor="#ffba77" disabled={pageLoading} onPress={() => {
            if (pageError && !error) onMore?.();
            else { setReload((n) => n + 1); setVoteReload((n) => n + 1); }
          }}>Retry</Button></View> : null}
        <View style={styles.controls}>
          <Button testID="photo-vote-like" icon="thumb-up-outline" contentStyle={{ minHeight: 44 }} mode={photo?.current_vote === 1 ? 'contained' : 'outlined'}
            accessibilityLabel={`Like, ${photo?.like_count ?? 0}`} accessibilityState={{ selected: photo?.current_vote === 1 }}
            disabled={!displayedAsset || !votesReady || busy[photo?.submission_id] || isVotePending?.(photo?.submission_id)} onPress={() => void cast(1)}>Like {photo?.like_count ?? 0}</Button>
          <Button testID="photo-vote-dislike" icon="thumb-down-outline" contentStyle={{ minHeight: 44 }} mode={photo?.current_vote === -1 ? 'contained' : 'outlined'}
            accessibilityLabel={`Dislike, ${photo?.dislike_count ?? 0}`} accessibilityState={{ selected: photo?.current_vote === -1 }}
            disabled={!displayedAsset || !votesReady || busy[photo?.submission_id] || isVotePending?.(photo?.submission_id)} onPress={() => void cast(-1)}>Dislike {photo?.dislike_count ?? 0}</Button>
        </View>
        <View style={styles.controls}>
          <Button testID="photo-previous" textColor="#fff" disabled={index === 0} onPress={() => navigate(index - 1)}>Previous</Button>
          <Button textColor="#bbb" onPress={() => zoom.current?.reset()}>Reset zoom</Button>
          <Button testID="photo-next" textColor="#fff" loading={pageLoading && index === items.length - 1}
            disabled={index === items.length - 1 && (!hasMore || pageLoading)} onPress={() => navigate(index + 1)}>Next</Button>
        </View>
        <Text style={[styles.muted, { textAlign: 'center', fontSize: 12 }]}>Pinch or double tap to zoom · Swipe at 1× to browse</Text>
      </View>
    </GestureHandlerRootView>
  </Modal>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0d' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, minHeight: 64 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' }, muted: { color: '#c7c7cc' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imageLoading: { position: 'absolute', alignSelf: 'center' },
  footer: { padding: 12, gap: 8 }, controls: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  message: { alignItems: 'center' },
});
