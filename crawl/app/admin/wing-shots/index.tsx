import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminQueueCard } from '../../../components/admin/wingShots/AdminQueueCard';
import { ReviewActionSheet } from '../../../components/admin/wingShots/ReviewActionSheet';
import {
  AdminWingShotsError,
  loadWingAdminQueue,
  type AdminQueueItem,
  type WingReviewAction,
} from '../../../lib/adminWingShots';
import { useAuth } from '../../../providers/AuthProvider';

type AccessState = 'loading' | 'ready' | 'signed_out' | 'denied' | 'disabled' | 'error';

export default function WingShotsAdminQueueScreen() {
  const router = useRouter();
  const { user, initializing } = useAuth();
  const [items, setItems] = useState<AdminQueueItem[]>([]);
  const [accessState, setAccessState] = useState<AccessState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AdminQueueItem | null>(null);
  const [action, setAction] = useState<WingReviewAction | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!user?.id) {
      setItems([]);
      setAccessState('signed_out');
      return;
    }
    if (refresh) setRefreshing(true);
    else setAccessState('loading');
    try {
      const queue = await loadWingAdminQueue(30);
      setItems(queue);
      setAccessState('ready');
    } catch (caught) {
      setItems([]);
      if (caught instanceof AdminWingShotsError) {
        if (caught.code === 'access_denied') setAccessState('denied');
        else if (caught.code === 'feature_disabled') setAccessState('disabled');
        else setAccessState('error');
      } else {
        setAccessState('error');
      }
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (initializing) return;
    load();
  }, [initializing, load]);

  const startAction = (item: AdminQueueItem, nextAction: WingReviewAction) => {
    setSelected(item);
    setAction(nextAction);
    setAnnouncement(null);
  };

  const closeAction = () => {
    setSelected(null);
    setAction(null);
  };

  const completeAction = async () => {
    const actionLabel = action
      ? action.replaceAll('_', ' ')
      : 'review action';
    closeAction();
    setAnnouncement(`${actionLabel} recorded. Queue refreshed.`);
    await load(true);
  };

  return (
    <SafeAreaView style={styles.safe} testID="wing-admin.root">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          testID="wing-admin.back"
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow} allowFontScaling>
            INTERNAL · JALAPEÑO
          </Text>
          <Text style={styles.title} accessibilityRole="header" allowFontScaling>
            Wing Shot review
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh moderation queue"
          disabled={accessState === 'loading'}
          onPress={() => load(true)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          testID="wing-admin.refresh"
        >
          <Ionicons name="refresh" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      {announcement ? (
        <Text
          style={styles.announcement}
          accessibilityLiveRegion="polite"
          allowFontScaling
          testID="wing-admin.announcement"
        >
          {announcement}
        </Text>
      ) : null}

      {accessState === 'loading' || initializing ? (
        <StatusPanel
          icon="hourglass-outline"
          title="Checking reviewer access"
          message="The queue stays private until your role and rollout access are verified."
          loading
          testID="wing-admin.loading"
        />
      ) : null}

      {accessState === 'signed_out' ? (
        <StatusPanel
          icon="lock-closed-outline"
          title="Sign-in required"
          message="Use an authorized BuffaGo internal account to open this moderation queue."
          testID="wing-admin.signed-out"
        >
          <PanelButton
            label="Go to sign in"
            testID="wing-admin.sign-in"
            onPress={() => router.replace('/auth/login')}
          />
        </StatusPanel>
      ) : null}

      {accessState === 'denied' ? (
        <StatusPanel
          icon="shield-outline"
          title="Review access unavailable"
          message="This account does not have an active Wing Shots reviewer role. No queue data was loaded."
          testID="wing-admin.denied"
        />
      ) : null}

      {accessState === 'disabled' ? (
        <StatusPanel
          icon="toggle-outline"
          title="Moderation queue disabled"
          message="The server-controlled moderation rollout is off for this account."
          testID="wing-admin.disabled"
        />
      ) : null}

      {accessState === 'error' ? (
        <StatusPanel
          icon="cloud-offline-outline"
          title="Queue unavailable"
          message="Reviewer access could not be verified. No queue data was loaded."
          testID="wing-admin.error"
        >
          <PanelButton label="Try again" testID="wing-admin.retry" onPress={() => load()} />
        </StatusPanel>
      ) : null}

      {accessState === 'ready' ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.submission_id}
          contentContainerStyle={[styles.list, items.length === 0 && styles.emptyList]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#F2A93B"
            />
          }
          renderItem={({ item }) => (
            <AdminQueueCard item={item} onAction={(nextAction) => startAction(item, nextAction)} />
          )}
          ListHeaderComponent={
            <View style={styles.intro}>
              <Text style={styles.introTitle} allowFontScaling>
                Human approval is authoritative
              </Text>
              <Text style={styles.introText} allowFontScaling>
                Review processed media, visible flags, consent, rating context, and duplicate
                signals. Manual priority never bypasses safety.
              </Text>
              <Text style={styles.count} allowFontScaling testID="wing-admin.queue-count">
                {items.length} item{items.length === 1 ? '' : 's'} loaded
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={34} color="#9BD4AA" />
              <Text style={styles.emptyTitle} allowFontScaling>
                Queue clear
              </Text>
              <Text style={styles.emptyText} allowFontScaling>
                No Wing Shots are waiting for human review.
              </Text>
            </View>
          }
          initialNumToRender={5}
          testID="wing-admin.queue-list"
        />
      ) : null}

      {selected ? (
        <ReviewActionSheet
          item={selected}
          action={action}
          onDismiss={closeAction}
          onCompleted={completeAction}
        />
      ) : null}
    </SafeAreaView>
  );
}

function StatusPanel({
  icon,
  title,
  message,
  loading = false,
  testID,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  loading?: boolean;
  testID: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.status} testID={testID} accessibilityLabel={`${title}. ${message}`}>
      {loading ? (
        <ActivityIndicator color="#F2A93B" size="large" />
      ) : (
        <Ionicons name={icon} size={36} color="#F2A93B" />
      )}
      <Text style={styles.statusTitle} accessibilityRole="header" allowFontScaling>
        {title}
      </Text>
      <Text style={styles.statusMessage} allowFontScaling>
        {message}
      </Text>
      {children}
    </View>
  );
}

function PanelButton({
  label,
  testID,
  onPress,
}: {
  label: string;
  testID: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.panelButton, pressed && styles.pressed]}
      testID={testID}
    >
      <Text style={styles.panelButtonText} allowFontScaling>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#090B0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 72,
    borderBottomWidth: 1,
    borderBottomColor: '#2A303A',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconButton: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: '#F2A93B',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  announcement: {
    color: '#BFE7C9',
    backgroundColor: '#16301E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  list: {
    gap: 16,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 40,
  },
  emptyList: {
    flexGrow: 1,
  },
  intro: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  introTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '900',
  },
  introText: {
    color: '#B8BEC8',
    fontSize: 15,
    lineHeight: 22,
  },
  count: {
    color: '#F2A93B',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  status: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  statusTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusMessage: {
    color: '#B8BEC8',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  panelButton: {
    width: '100%',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F2A93B',
    paddingHorizontal: 16,
    marginTop: 6,
  },
  panelButtonText: {
    color: '#050607',
    fontSize: 16,
    fontWeight: '900',
  },
  empty: {
    flex: 1,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    padding: 24,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '900',
  },
  emptyText: {
    color: '#B8BEC8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
