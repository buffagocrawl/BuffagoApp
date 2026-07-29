import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import ScreenHeader from '../../../components/ScreenHeader';
import SubmissionStatusChip from '../../../components/creator/SubmissionStatusChip';
import { formatWingShotRejectionReason } from '../../../lib/wingShotRejection';
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
        ListHeaderComponent={<WingCreatorSummaryCard refreshKey={refreshKey} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          error ? (
            <View testID="creator.history.error" style={styles.centerBlock}>
              <Text style={{ color: theme.colors.error, textAlign: 'center' }}>{error}</Text>
              <Button onPress={() => load({ append: false })}>Retry</Button>
            </View>
          ) : (
            <View testID="creator.history.empty" style={styles.centerBlock}>
              <Text variant="titleMedium" style={styles.emptyTitle}>
                No Wing Shots yet
              </Text>
              <Text style={styles.emptyBody}>
                You can optionally share a photo or short video from any restaurant.
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <Card
            testID={index === 0 ? 'creator.history.first-item' : undefined}
            mode="elevated"
            style={styles.card}
            onPress={() => router.push(`/profile/wing-shots/${item.submission_id}`)}
            accessibilityLabel={`${mediaLabel(item.media_type)}, ${item.display_status}, submitted ${formatDate(
              item.created_at
            )}`}
            accessibilityHint="Opens Wing Shot details"
          >
            <Card.Content style={styles.cardContent}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={styles.itemTitle}>
                    {mediaLabel(item.media_type)}
                  </Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    Submitted {formatDate(item.created_at)}
                  </Text>
                </View>
                <SubmissionStatusChip status={item.display_status} />
              </View>
              {item.display_status === 'Rejected' && item.rejection_category ? (
                <Text variant="bodySmall" style={styles.rejection}>
                  {formatWingShotRejectionReason(item.rejection_category)}
                </Text>
              ) : null}
            </Card.Content>
          </Card>
        )}
        ListFooterComponent={
          hasMore ? (
            <Button
              testID="creator.history.load-more"
              mode="text"
              loading={loadingMore}
              disabled={loadingMore}
              onPress={() => load({ append: true })}
              style={styles.loadMore}
            >
              Load More
            </Button>
          ) : (
            <View style={{ height: 16 }} />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingTop: 8, paddingBottom: 28 },
});
