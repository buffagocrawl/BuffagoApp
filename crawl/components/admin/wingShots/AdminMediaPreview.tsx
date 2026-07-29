import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { loadWingAdminPreview } from '../../../lib/adminWingShots';

type Props = {
  submissionId: string;
  mediaType: 'photo' | 'video';
};

export function AdminMediaPreview({ submissionId, mediaType }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setUri(null);
    setMessage(null);
  }, [submissionId]);

  useEffect(() => {
    if (!uri) return;
    const timeout = setTimeout(() => setUri(null), 55_000);
    return () => clearTimeout(timeout);
  }, [uri]);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const preview = await loadWingAdminPreview(submissionId, 'processed');
      setUri(preview.signedUrl);
    } catch {
      setUri(null);
      setMessage('Protected preview unavailable. Processing may still be underway.');
    } finally {
      setLoading(false);
    }
  };

  if (uri) {
    return (
      <View
        style={styles.preview}
        testID={`wing-admin.queue.${submissionId}.preview`}
        accessibilityLabel={`Protected processed ${mediaType} preview`}
      >
        {mediaType === 'video' ? (
          <AdminMutedVideo uri={uri} />
        ) : (
          <Image
            source={{ uri }}
            contentFit="contain"
            style={styles.media}
            accessibilityLabel="Processed Wing Shot photo submitted for review"
            testID={`wing-admin.queue.${submissionId}.preview-photo`}
          />
        )}
        <Text style={styles.protectionNote} allowFontScaling>
          Protected processed preview · expires shortly
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.placeholder}>
      <Ionicons name="lock-closed-outline" size={22} color="#F2A93B" />
      <Text style={styles.placeholderText} allowFontScaling>
        Originals stay private. Review the processed {mediaType} only.
      </Text>
      {message ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion="polite"
          allowFontScaling
          testID={`wing-admin.queue.${submissionId}.preview-error`}
        >
          {message}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Load protected processed ${mediaType} preview`}
        disabled={loading}
        onPress={load}
        style={({ pressed }) => [
          styles.loadButton,
          pressed && styles.pressed,
          loading && styles.disabled,
        ]}
        testID={`wing-admin.queue.${submissionId}.preview-load`}
      >
        {loading ? (
          <ActivityIndicator color="#050607" />
        ) : (
          <Text style={styles.loadButtonText} allowFontScaling>
            Load processed preview
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function AdminMutedVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (configuredPlayer) => {
    configuredPlayer.loop = false;
    configuredPlayer.muted = true;
  });

  return (
    <View style={styles.video}>
      <VideoView
        player={player}
        nativeControls
        allowsFullscreen={false}
        contentFit="contain"
        style={styles.media}
        accessibilityLabel="Processed muted Wing Shot video submitted for review"
        testID="wing-admin.preview-video"
      />
      <View style={styles.muted}>
        <Ionicons name="volume-mute" size={18} color="#FFFFFF" />
        <Text style={styles.mutedText} allowFontScaling>
          Processed derivative · original audio removed
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#050607',
  },
  media: {
    width: '100%',
    minHeight: 220,
    aspectRatio: 4 / 3,
  },
  video: {
    backgroundColor: '#050607',
  },
  muted: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1D2430',
  },
  mutedText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  protectionNote: {
    color: '#D7DBE3',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
  placeholder: {
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#39404C',
    backgroundColor: '#151A22',
    padding: 16,
  },
  placeholderText: {
    color: '#D7DBE3',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  error: {
    color: '#FFB4AB',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  loadButton: {
    minHeight: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F2A93B',
    paddingHorizontal: 16,
  },
  loadButtonText: {
    color: '#050607',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.74,
  },
  disabled: {
    opacity: 0.56,
  },
});
