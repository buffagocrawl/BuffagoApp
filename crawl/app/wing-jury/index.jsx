import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import WingJuryGame from '../../components/WingJuryGame';

export default function WingJuryScreen() {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
      <WingJuryGame />
    </SafeAreaView>
  );
}
