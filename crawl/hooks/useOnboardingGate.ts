// hooks/useOnboardingGate.ts
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_DONE_KEY = 'buffago:onboarding_done_v3';
export const LEGACY_ONBOARDING_KEYS = ['buffago:onboarding:complete', 'hasSeenIntro'] as const;

async function readOnboardingState() {
  const entries = await AsyncStorage.multiGet([ONBOARDING_DONE_KEY, ...LEGACY_ONBOARDING_KEYS]);
  const values = Object.fromEntries(entries);

  const doneValue = values[ONBOARDING_DONE_KEY];
  const legacyComplete = values['buffago:onboarding:complete'];
  const legacyIntro = values.hasSeenIntro;

  const isDone =
    doneValue === '1' ||
    doneValue === 'true' ||
    legacyComplete === 'true' ||
    legacyComplete === '1' ||
    legacyIntro === 'true' ||
    legacyIntro === '1';

  return { isDone, values };
}

export async function hasCompletedOnboarding() {
  const { isDone } = await readOnboardingState();
  return isDone;
}

export async function markOnboardingSeen() {
  await AsyncStorage.multiSet([
    [ONBOARDING_DONE_KEY, '1'],
    ['buffago:onboarding:complete', 'true'],
    ['hasSeenIntro', 'true'],
  ]);
}

export function useOnboardingGate() {
  const [loading, setLoading] = useState(true);
  const [shouldShowIntro, setShouldShowIntro] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const done = await hasCompletedOnboarding();
        if (!active) return;
        setShouldShowIntro(!done);
      } catch {
        if (!active) return;
        setShouldShowIntro(false);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function markIntroSeen() {
    await markOnboardingSeen();
    setShouldShowIntro(false);
  }

  return { loading, shouldShowIntro, markIntroSeen };
}
