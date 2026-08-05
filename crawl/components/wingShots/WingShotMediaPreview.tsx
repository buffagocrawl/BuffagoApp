import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WingShotSelectedMedia } from './mediaAdapter';

type Props = {
  media: WingShotSelectedMedia;
  disabled?: boolean;
  onReplace: () => void;
  onRemove: () => void;
};

export function WingShotMediaPreview({ media, disabled = false, onReplace, onRemove }: Props) {
  return (
    <View style={styles.card} testID="wing-shot.preview" accessibilityLabel="Selected Wing Shot photo preview">
      <Image source={{ uri: media.uri }} style={styles.image} contentFit="cover" accessibilityLabel="Your selected wing photo" testID="wing-shot.preview.photo" />
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Replace selected Wing Shot" disabled={disabled} onPress={onReplace} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} testID="wing-shot.preview.replace">
          <Text style={styles.secondaryButtonText} allowFontScaling>Replace</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove selected Wing Shot" disabled={disabled} onPress={onRemove} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} testID="wing-shot.preview.remove">
          <Text style={styles.secondaryButtonText} allowFontScaling>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#1D2430' },
  image: { width: '100%', minHeight: 220, aspectRatio: 4 / 3 },
  actions: { flexDirection: 'row', gap: 12, padding: 12 },
  secondaryButton: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#F2A93B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
