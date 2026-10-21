import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENABLE_ONBOARDING_V2 } from '../config/features';
import { hasCompletedOnboarding } from '../hooks/useOnboardingGate';

type LocState = {
  status: 'unknown' | 'granted' | 'denied';
  coords: { latitude: number; longitude: number } | null;
  askPermission: () => Promise<void>;
  refreshPosition: () => Promise<void>;
};

const Ctx = createContext<LocState>({
  status: 'unknown',
  coords: null,
  askPermission: async () => {},
  refreshPosition: async () => {},
});

export const useLocationCtx = () => useContext(Ctx);

export default function LocationProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LocState['status']>('unknown');
  const [coords, setCoords] = useState<LocState['coords']>(null);

  const askPermission = useCallback(async () => {
    const { status: s } = await Location.requestForegroundPermissionsAsync();
    if (s !== 'granted') {
      setStatus('denied');
      return;
    }
    setStatus('granted');
    await refreshPosition();
  }, []);

  const refreshPosition = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch (_) {
      // ignore for now
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const participant = await AsyncStorage.getItem('buffago:onboarding:v2_arrival');
      const freshV2 = ENABLE_ONBOARDING_V2 && !await hasCompletedOnboarding();
      if (!active) return;
      if (participant || freshV2) {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!active) return;
        setStatus(permission.status === 'granted' ? 'granted' : 'unknown');
        if (permission.status === 'granted') await refreshPosition();
      } else await askPermission();
    })().catch(() => {});
    return () => { active = false; };
  }, [askPermission, refreshPosition]);

  return (
    <Ctx.Provider value={{ status, coords, askPermission, refreshPosition }}>
      {children}
    </Ctx.Provider>
  );
}

// Optional helper if denied: open OS settings
export async function openLocationSettings() {
  await Linking.openSettings();
}
