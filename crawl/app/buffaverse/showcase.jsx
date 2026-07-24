import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import { LegendaryShowcaseHarness } from '../../components/buffaverse/LegendaryExperience';
import { LEGENDARY_SHOWCASE_FIXTURES } from '../../lib/buffaverse/legendaryShowcase';

export default function LegendaryShowcaseRoute() {
  if (!__DEV__ && process.env.NODE_ENV !== 'test') {
    return <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text>Legendary discovery is not available here.</Text></SafeAreaView>;
  }
  return <SafeAreaView style={{ flex: 1 }}><LegendaryShowcaseHarness fixtures={LEGENDARY_SHOWCASE_FIXTURES} /></SafeAreaView>;
}

