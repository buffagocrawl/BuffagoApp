import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import { BossBattleShowcaseHarness } from '../../components/buffaverse/BossBattleExperience';
import { BOSS_BATTLE_SHOWCASE_FIXTURES } from '../../lib/buffaverse/bossBattles';

export default function BossBattlesRoute() {
  if (!__DEV__ && process.env.NODE_ENV !== 'test') return <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text>Boss Battles are not enabled.</Text></SafeAreaView>;
  return <SafeAreaView style={{ flex: 1 }}><BossBattleShowcaseHarness fixtures={BOSS_BATTLE_SHOWCASE_FIXTURES} /></SafeAreaView>;
}
