import { useRef, useState } from 'react';
import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CropZoom, type CropZoomRefType } from 'react-native-zoom-toolkit';
import { frameWingShotMedia, type WingShotSelectedMedia } from './mediaAdapter';

export function WingShotFramingPreview({ media, onConfirm, onCancel }: {
  media: WingShotSelectedMedia;
  onConfirm: (media: WingShotSelectedMedia) => void;
  onCancel: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const edge = Math.max(120, Math.min(width - 48, height - 300, 420));
  const cropper = useRef<CropZoomRefType>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const resolution = { width: media.width || 1, height: media.height || 1 };
  const scale = Math.max(edge / resolution.width, edge / resolution.height);
  const confirm = async () => {
    if (!ready || saving.current || !cropper.current) return;
    saving.current = true; setBusy(true); setError('');
    try { onConfirm(await frameWingShotMedia(media, cropper.current.crop().crop)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not frame this photo. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <GestureHandlerRootView testID="wing-shot.framing" style={{ alignItems: 'center', gap: 16 }}>
    <Text style={{ fontSize: 24, fontWeight: '800', color: '#1D2430' }}>Frame your Wing Shot</Text>
    <Text style={{ textAlign: 'center' }}>Drag to reposition. Pinch to zoom. The square is your final photo.</Text>
    <View accessibilityLabel="Final square photo crop" style={{ width: edge, height: edge, overflow: 'hidden', backgroundColor: '#111' }}>
      <CropZoom key={edge} ref={cropper} cropSize={{ width: edge, height: edge }} resolution={resolution}
        minScale={1} maxScale={4} panMode="clamp" scaleMode="clamp">
        <Image source={{ uri: media.uri }} style={{ width: resolution.width * scale, height: resolution.height * scale }}
          onLoad={() => setReady(true)} onError={() => { setReady(false); setError('Photo could not load. Cancel and choose it again.'); }} />
      </CropZoom>
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderWidth: 2, borderColor: '#A83D18' }} />
    </View>
    {error ? <Text accessibilityRole="alert" style={{ color: '#9C2F16' }}>{error}</Text> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
      {[{ label: 'Cancel', action: onCancel }, { label: 'Reset', action: () => cropper.current?.reset(false) }, { label: busy ? 'Saving…' : 'Confirm framing', action: confirm }].map(({ label, action }, index) =>
        <Pressable key={index} accessibilityRole="button" testID={`wing-shot.frame-${['cancel', 'reset', 'confirm'][index]}`}
          disabled={busy || (index === 2 && !ready)} onPress={action}
          style={{ minHeight: 48, padding: 14, borderRadius: 12, backgroundColor: index === 2 ? '#A83D18' : '#EEE4D5' }}>
          <Text style={{ color: index === 2 ? '#fff' : '#1D2430', fontWeight: '700' }}>{label}</Text>
        </Pressable>)}
    </View>
  </GestureHandlerRootView>;
}
