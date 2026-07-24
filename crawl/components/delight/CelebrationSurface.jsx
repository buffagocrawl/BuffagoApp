import React, { useEffect } from 'react';
import { Animated } from 'react-native';
import { useCelebration } from './useCelebration';

export default function CelebrationSurface({
  active,
  level = 'standard',
  screen,
  source,
  style,
  children,
}) {
  const { celebrate, animatedStyle } = useCelebration({ screen, source });
  useEffect(() => {
    if (active) celebrate({ level });
  }, [active, celebrate, level]);
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
