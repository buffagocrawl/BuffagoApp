import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WingShotSelectedMedia } from './mediaAdapter';

type Props = {
  media: WingShotSelectedMedia;
  disabled?: boolean;
  onReplace: () => void;
  onRemove: () => void;
};

export function WingShotMediaPreview({
  media,
  disabled = false,
  onReplace,
  onRemove,
}: Props) {
  return (
    <View
      style={styles.card}
      testID="wing-shot.preview"
      accessibilityLabel={
        media.kind === 'photo'
          ? 'Selected Wing Shot photo preview'
          : `Selected Wing Shot video, ${Math.round(media.durationSeconds ?? 0)} seconds`
      }
    >
      {media.kind === 'photo' ? (
        <Image
          source={{ uri: media.uri }}
          style={styles.image}
          contentFit="cover"
          accessibilityLabel="Your selected wing photo"
          testID="wing-shot.preview.photo"
        />
      ) : (
        <MutedVideoPreview media={media} />
      )}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Replace selected Wing Shot"
          disabled={disabled}
          onPress={onReplace}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          testID="wing-shot.preview.replace"
        >
          <Text style={styles.secondaryButtonText} allowFontScaling>
            Replace
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove selected Wing Shot"
          disabled={disabled}
          onPress={onRemove}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          testID="wing-shot.preview.remove"
        >
          <Text style={styles.secondaryButtonText} allowFontScaling>
            Remove
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function MutedVideoPreview({ media }: { media: WingShotSelectedMedia }) {
  const player = useVideoPlayer(media.uri, (configuredPlayer) => {
    configuredPlayer.muted = true;
    configuredPlayer.loop = true;
  });

  return (
    <View style={styles.videoContainer} testID="wing-shot.preview.video">
      <VideoView
        accessibilityLabel="Muted preview of your selected wing video"
        fullscreenOptions={{ enable: false }}
        contentFit="contain"
        nativeControls
        player={player}
        style={styles.image}
        testID="wing-shot.preview.video-player"
      />
      <View style={styles.videoNote}>
        <Ionicons name="volume-mute" size={19} color="#FFFFFF" accessibilityElementsHidden />
        <Text style={styles.videoText} allowFontScaling>
          Muted preview · {Math.round(media.durationSeconds ?? 0)} sec · published audio is
          removed
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1D2430',
  },
  image: {
    width: '100%',
    minHeight: 220,
    aspectRatio: 4 / 3,
  },
  videoContainer: {
    position: 'relative',
    backgroundColor: '#050607',
  },
  videoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1D2430',
  },
  videoText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F2A93B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});
