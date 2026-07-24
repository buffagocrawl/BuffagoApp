import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useCelebration } from '../delight/useCelebration';
import { trackMascotEvent, type MascotAnalyticsContext } from './analytics';
import { BuffagoMascot } from './BuffagoMascot';
import { isMascotSurfaceEnabled, mascotConfig } from './config';
import type { MascotMood, MascotPose, MascotSize, MascotSurface } from './types';

type Props = {
  active: boolean;
  surface: MascotSurface;
  sourceScreen: string;
  pose?: MascotPose;
  mood?: MascotMood;
  level?: 'micro' | 'standard' | 'major';
  size?: MascotSize;
  triggerAnimation?: boolean;
  accessibilityLabel?: string;
  haptic?: boolean;
  onCompleted?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function MascotCelebration({
  active,
  surface,
  sourceScreen,
  pose = 'hero',
  mood = 'celebrating',
  level = 'standard',
  size,
  triggerAnimation = true,
  accessibilityLabel = 'Buffago celebrating your achievement',
  haptic = false,
  onCompleted,
  style,
  testID,
}: Props) {
  const enabled = isMascotSurfaceEnabled(surface);
  const { celebrate, reducedMotion, motionPreferenceResolved, animatedStyle } = useCelebration({
    screen: sourceScreen,
    source: `mascot:${surface}`,
  });
  const wasActive = useRef(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  const context = useMemo<MascotAnalyticsContext>(
    () => ({
      surface,
      momentType: 'achievement',
      pose,
      mood,
      sourceScreen,
      animationEnabled: triggerAnimation && mascotConfig.animationsEnabled && !reducedMotion,
      reducedMotion,
    }),
    [mood, pose, reducedMotion, sourceScreen, surface, triggerAnimation]
  );

  useEffect(() => {
    if (!motionPreferenceResolved) return;
    const entering = active && !wasActive.current;
    wasActive.current = active;
    if (!entering || !enabled) return;
    if (triggerAnimation) celebrate({ level, haptic });
    const duration = reducedMotion ? 0 : level === 'major' ? 420 : level === 'standard' ? 260 : 140;
    completionTimer.current = setTimeout(() => {
      void trackMascotEvent('mascot_celebration_completed', context);
      onCompletedRef.current?.();
    }, duration);
    return () => {
      if (completionTimer.current) clearTimeout(completionTimer.current);
    };
  }, [
    active,
    celebrate,
    context,
    enabled,
    haptic,
    level,
    motionPreferenceResolved,
    reducedMotion,
    triggerAnimation,
  ]);

  if (!active || !enabled) return null;
  return (
    <Animated.View pointerEvents="none" style={[style, animatedStyle]}>
      <BuffagoMascot
        pose={pose}
        mood={mood}
        size={size || (level === 'major' ? 'large' : 'medium')}
        animated={false}
        decorative={false}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
    </Animated.View>
  );
}
