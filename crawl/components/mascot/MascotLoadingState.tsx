import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { BuffagoMascot } from './BuffagoMascot';
import { isMascotSurfaceEnabled } from './config';
import type { MascotMood, MascotPose, MascotSurface } from './types';

type Props = {
  surface: MascotSurface;
  title: string;
  message?: string;
  pose?: MascotPose;
  mood?: MascotMood;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function MascotLoadingState({
  surface,
  title,
  message,
  pose = 'hero',
  mood = 'searching',
  accessibilityLabel = 'Buffago is helping prepare this screen',
  style,
  testID,
}: Props) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={title}
      accessibilityHint={message}
      accessibilityLiveRegion="polite"
      style={[styles.container, style]}
    >
      {isMascotSurfaceEnabled(surface) ? (
        <BuffagoMascot
          pose={pose}
          mood={mood}
          size="medium"
          animated
          decorative
          accessibilityLabel={accessibilityLabel}
        />
      ) : null}
      <ActivityIndicator color={theme.colors.primary} style={styles.indicator} />
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: 18, paddingVertical: 20 },
  indicator: { marginTop: 8 },
  title: { fontWeight: '800', marginTop: 10, textAlign: 'center' },
  message: { marginTop: 5, opacity: 0.75, textAlign: 'center' },
});

