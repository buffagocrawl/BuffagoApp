import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { useReducedMotion } from '../delight/useReducedMotion';
import { trackMascotEvent, type MascotAnalyticsContext } from './analytics';
import { BuffagoMascot } from './BuffagoMascot';
import { isMascotSurfaceEnabled, mascotConfig } from './config';
import { useMascotImpression } from './useMascotImpression';
import type {
  MascotAction,
  MascotMood,
  MascotMomentType,
  MascotPose,
  MascotSize,
  MascotSurface,
} from './types';

export type MascotMomentProps = {
  surface: MascotSurface;
  momentType: MascotMomentType;
  sourceScreen: string;
  title: string;
  message?: string;
  pose?: MascotPose;
  mood?: MascotMood;
  size?: MascotSize;
  animated?: boolean;
  decorative?: boolean;
  accessibilityLabel?: string;
  primaryAction?: MascotAction;
  secondaryAction?: MascotAction;
  visible?: boolean;
  mascotTestID?: string;
  style?: StyleProp<ViewStyle>;
};

export function MascotMoment({
  surface,
  momentType,
  sourceScreen,
  title,
  message,
  pose = 'hero',
  mood = 'neutral',
  size = 'medium',
  animated = false,
  decorative = false,
  accessibilityLabel,
  primaryAction,
  secondaryAction,
  visible = true,
  mascotTestID,
  style,
}: MascotMomentProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const mascotVisible = visible && isMascotSurfaceEnabled(surface);
  const animationEnabled = animated && mascotConfig.animationsEnabled && !reducedMotion;
  const context = useMemo<MascotAnalyticsContext>(
    () => ({
      surface,
      momentType,
      pose,
      mood,
      sourceScreen,
      animationEnabled,
      reducedMotion,
    }),
    [animationEnabled, momentType, mood, pose, reducedMotion, sourceScreen, surface]
  );
  useMascotImpression(mascotVisible, context);

  const runAction = (action: MascotAction, secondary = false) => {
    void trackMascotEvent(
      secondary ? 'mascot_secondary_action_pressed' : 'mascot_primary_action_pressed',
      { ...context, actionId: action.id }
    );
    action.onPress();
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant },
        style,
      ]}
    >
      {mascotVisible ? (
        <BuffagoMascot
          pose={pose}
          mood={mood}
          size={size}
          animated={animationEnabled}
          decorative={decorative}
          accessibilityLabel={accessibilityLabel}
          testID={mascotTestID}
        />
      ) : null}
      <Text variant="titleLarge" style={styles.title}>
        {title}
      </Text>
      {message ? (
        <Text variant="bodyMedium" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {primaryAction || secondaryAction ? (
        <View style={styles.actions}>
          {secondaryAction ? (
            <Button
              mode="outlined"
              onPress={() => runAction(secondaryAction, true)}
              accessibilityLabel={secondaryAction.accessibilityLabel}
              style={styles.button}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
          {primaryAction ? (
            <Button
              mode="contained"
              onPress={() => runAction(primaryAction)}
              accessibilityLabel={primaryAction.accessibilityLabel}
              style={styles.button}
            >
              {primaryAction.label}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  title: { fontWeight: '800', marginTop: 10, textAlign: 'center' },
  message: { marginTop: 6, opacity: 0.78, textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginTop: 16,
  },
  button: { borderRadius: 14 },
});

