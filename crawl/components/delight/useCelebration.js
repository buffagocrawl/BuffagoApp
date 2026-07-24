import { useCallback, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { trackEvent } from '../../lib/analytics';
import { getCelebrationPlan } from '../../lib/delight/celebration';
import { useReducedMotionPreference } from './useReducedMotion';

const runHaptic = async (kind) => {
  if (kind === 'success') return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  const style =
    kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
  return Haptics.impactAsync(style);
};

export function useCelebration({ screen = 'unknown', source = 'interaction' } = {}) {
  const { reducedMotion, resolved: motionPreferenceResolved } = useReducedMotionPreference();
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const celebrate = useCallback(
    ({ level = 'micro', haptic = true } = {}) => {
      if (!motionPreferenceResolved) return;
      const plan = getCelebrationPlan(level, reducedMotion);
      trackEvent({
        eventName: 'celebration_shown',
        screen,
        metadata: { level: plan.level, source, reduced_motion: reducedMotion },
      });
      if (reducedMotion) {
        trackEvent({
          eventName: 'reduced_motion_respected',
          screen,
          metadata: { source, celebration_level: plan.level },
        });
      }
      if (haptic) {
        runHaptic(plan.haptic)
          .then(() =>
            trackEvent({
              eventName: 'haptic_triggered',
              screen,
              metadata: { source, haptic_type: plan.haptic },
            })
          )
          .catch(() => {});
      }
      if (!plan.animate) return;
      scale.setValue(plan.scaleFrom);
      opacity.setValue(0.75);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          speed: 22,
          bounciness: level === 'major' ? 8 : 4,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: plan.duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    },
    [motionPreferenceResolved, opacity, reducedMotion, scale, screen, source]
  );

  return {
    celebrate,
    reducedMotion,
    motionPreferenceResolved,
    animatedStyle: { opacity, transform: [{ scale }] },
  };
}
