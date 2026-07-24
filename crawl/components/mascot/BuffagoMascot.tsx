import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useReducedMotionPreference } from '../delight/useReducedMotion';
import { mascotConfig } from './config';
import { MASCOT_SIZE_PIXELS } from './domain';
import { MascotErrorBoundary } from './MascotErrorBoundary';
import { resolveMascotAsset } from './registry';
import { useMascotImpression } from './useMascotImpression';
import type { MascotCommonProps } from './types';

const warnedLabels = new Set<string>();

function BuffagoMascotImage({
  pose = 'hero',
  mood = 'neutral',
  size = 'medium',
  animated = false,
  decorative = true,
  accessibilityLabel,
  testID,
  style,
  analyticsSurface,
  analyticsMomentType,
  sourceScreen,
}: MascotCommonProps) {
  const { reducedMotion, resolved: motionPreferenceResolved } = useReducedMotionPreference();
  const { width: windowWidth } = useWindowDimensions();
  const [failed, setFailed] = useState(false);
  const opacity = useRef(
    new Animated.Value(animated && mascotConfig.animationsEnabled ? 0 : 1)
  ).current;
  const scale = useRef(new Animated.Value(1)).current;
  const asset = useMemo(() => resolveMascotAsset(pose), [pose]);
  const configuredDimension = MASCOT_SIZE_PIXELS[size];
  const availableWidth = windowWidth > 0 ? Math.max(48, windowWidth - 32) : configuredDimension;
  const dimension = Math.min(configuredDimension, availableWidth);
  const shouldAnimate =
    animated && mascotConfig.animationsEnabled && motionPreferenceResolved && !reducedMotion;
  const safeLabel = decorative
    ? undefined
    : accessibilityLabel || `Buffago mascot, ${mood}`;
  useMascotImpression(
    Boolean(
      motionPreferenceResolved && analyticsSurface && analyticsMomentType && sourceScreen
    ),
    {
      surface: analyticsSurface || 'onboarding-welcome',
      momentType: analyticsMomentType || 'education',
      pose,
      mood,
      sourceScreen: sourceScreen || 'unknown',
      animationEnabled: shouldAnimate,
      reducedMotion,
    }
  );

  useEffect(() => {
    if (!decorative && !accessibilityLabel && __DEV__ && !warnedLabels.has(testID || pose)) {
      warnedLabels.add(testID || pose);
      console.warn('[mascot] Informational mascots should provide an accessibilityLabel.');
    }
  }, [accessibilityLabel, decorative, pose, testID]);

  useEffect(() => {
    if (!motionPreferenceResolved && animated && mascotConfig.animationsEnabled) {
      return;
    }
    if (!shouldAnimate) {
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }
    opacity.setValue(0);
    scale.setValue(0.94);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        speed: 20,
        bounciness: 4,
        useNativeDriver: true,
      }),
    ]).start();
    return () => {
      opacity.stopAnimation();
      scale.stopAnimation();
    };
  }, [animated, motionPreferenceResolved, opacity, scale, shouldAnimate]);

  if (failed)
    return (
      <View
        accessible={false}
        testID={testID ? `${testID}-fallback` : undefined}
        style={{ width: dimension, height: dimension }}
      />
    );

  return (
    <Animated.View
      testID={testID}
      style={[styles.frame, { width: dimension, height: dimension }, style, { opacity, transform: [{ scale }] }]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={safeLabel}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    >
      <Animated.Image
        accessible={false}
        accessibilityIgnoresInvertColors
        source={asset.source}
        resizeMode="contain"
        resizeMethod="resize"
        style={StyleSheet.absoluteFill}
        onError={() => {
          if (__DEV__) console.warn('[mascot] Image decode failed; preserving layout.');
          setFailed(true);
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({ frame: { alignSelf: 'center', flexShrink: 0 } });

const MemoizedMascotImage = memo(BuffagoMascotImage);

function BuffagoMascotComponent(props: MascotCommonProps) {
  return (
    <MascotErrorBoundary>
      <MemoizedMascotImage {...props} />
    </MascotErrorBoundary>
  );
}

export const BuffagoMascot = memo(BuffagoMascotComponent);
