// hooks/useOnboardingGate.ts
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'hasSeenIntro';

export function useOnboardingGate() {
  const [loading, setLoading] = useState(true);
  const [shouldShowIntro, setShouldShowIntro] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(KEY);
        setShouldShowIntro(!seen);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function markIntroSeen() {
    await AsyncStorage.setItem(KEY, 'true');
    setShouldShowIntro(false);
  }

  return { loading, shouldShowIntro, markIntroSeen };
}
