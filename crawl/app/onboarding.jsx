import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import OnboardingFlow from '../components/OnboardingFlow';

export default function OnboardingRoute() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <OnboardingFlow />
    </SafeAreaView>
  );
}