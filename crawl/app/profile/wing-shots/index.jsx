import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import ScreenHeader from '../../../components/ScreenHeader';
import WingCreatorSummaryCard from '../../../components/creator/WingCreatorSummaryCard';

export default function WingCreatorScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView
      testID="creator.overview"
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScreenHeader
        title="Your Wing Shots"
        subtitle="Private submission history and Creator progress"
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <WingCreatorSummaryCard />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingTop: 8, paddingBottom: 28 },
});
