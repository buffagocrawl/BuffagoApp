import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotionPreference() {
  const [preference, setPreference] = useState({
    reducedMotion: true,
    resolved: false,
  });

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setPreference({ reducedMotion: Boolean(enabled), resolved: true });
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setPreference({ reducedMotion: Boolean(enabled), resolved: true });
    });
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return preference;
}

export function useReducedMotion() {
  return useReducedMotionPreference().reducedMotion;
}
